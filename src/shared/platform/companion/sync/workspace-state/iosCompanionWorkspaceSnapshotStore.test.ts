import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';
import { expect, it, vi } from 'vitest';

import { ANDROID_COMPANION_NODE_RESOURCE_QUERY_DEFINITIONS } from '../../../../../../lib/core/database/androidCompanionNodeResourceQueryDefinitions';
import { createCapacitorSqliteDbPort } from '../../../capacitorSqliteDbPort';

import { loadCompanionSnapshotNodeRows } from './companionSnapshotNodeRows';
import { loadIosCompanionWorkspaceSnapshot } from './iosCompanionWorkspaceSnapshotStore';
import { seedSnapshotDatabase, SNAPSHOT_NODE_COUNT, snapshotConnection, snapshotNodeId } from './iosCompanionWorkspaceSnapshotTestSupport';

function snapshotPort(database: Database.Database) {
  const connection = snapshotConnection(database);
  return { connection, port: createCapacitorSqliteDbPort(connection as never, 'android') };
}

it('loads the complete lightweight directory without transferring node bodies', async () => {
  const database = new Database(':memory:');
  try {
    seedSnapshotDatabase(database);
    const { connection, port } = snapshotPort(database);
    const transferredBodies: string[] = [];
    const original = connection.query;
    vi.spyOn(connection, 'query').mockImplementation(async (sql, params) => {
      const result = await original(sql, params);
      for (const row of result.values as Array<Record<string, unknown>>) {
        if (typeof row.content === 'string' && row.content.length > 0) transferredBodies.push(row.content);
      }
      return result;
    });
    const snapshot = await loadIosCompanionWorkspaceSnapshot(port);
    expect(Object.keys(snapshot!.nodesById)).toHaveLength(SNAPSHOT_NODE_COUNT);
    expect(snapshot!.nodeOrder).toEqual([
      snapshotNodeId(0), ...Array.from({ length: 1200 }, (_, index) => snapshotNodeId(1200 - index))
    ]);
    expect(snapshot!.trashedNodeIds).toEqual([snapshotNodeId(1201)]);
    for (let index = 0; index < SNAPSHOT_NODE_COUNT; index++) {
      expect(snapshot!.nodesById[snapshotNodeId(index)]!.content).toBe('');
    }
    expect(snapshot!.nodesById[snapshotNodeId(0)]!.hasContent).toBe(true);
    expect(snapshot!.nodesById[snapshotNodeId(17)]!.hasContent).toBe(false);
    expect(snapshot!.nodesById['node-0']!.attachments?.[0]?.originalName).toBe('original.pdf');
    expect(transferredBodies).toEqual([]);
  } finally {
    database.close();
  }
});

it('keeps body pages and later attachments in one snapshot while another connection commits', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'snapshot-consistency-'));
  const file = path.join(root, 'fixture.sqlite');
  const database = new Database(file);
  const writer = new Database(file);
  try {
    database.pragma('journal_mode = WAL');
    seedSnapshotDatabase(database);
    const { connection, port } = snapshotPort(database);
    const original = connection.query;
    let committed = false;
    vi.spyOn(connection, 'query').mockImplementation(async (sql, params) => {
      const result = await original(sql, params);
      if (!committed && sql.includes('AS collection_source_content')) {
        writer.transaction(() => {
          writer.prepare("UPDATE nodes SET title = 'New title' WHERE id = 'node-0'").run();
          writer.prepare("UPDATE nodes SET resource_references = ? WHERE id = 'node-0'")
            .run(JSON.stringify([{ storage_key: `${'c'.repeat(64)}.pdf`, role: 'reference', original_name: 'new.pdf' }]));
        })();
        committed = true;
      }
      return result;
    });
    const snapshot = await loadIosCompanionWorkspaceSnapshot(port);
    expect(committed).toBe(true);
    expect(snapshot!.nodesById['node-0']!.title).toBe('Title 0');
    expect(snapshot!.nodesById['node-0']!.attachments?.[0]?.originalName).toBe('original.pdf');
    expect(writer.prepare("SELECT title FROM nodes WHERE id = 'node-0'").get()).toEqual({ title: 'New title' });
    expect(database.inTransaction).toBe(false);
  } finally {
    writer.close();
    database.close();
    rmSync(root, { recursive: true, force: true });
  }
});

it('preserves every directory field while reducing native bridge bytes', async () => {
  const database = new Database(':memory:');
  try {
    seedSnapshotDatabase(database);
    database.prepare('UPDATE nodes SET initial_review_due = ? WHERE id = ?')
      .run('2026-11-01T08:00:00.000Z', snapshotNodeId(0));
    const { connection, port } = snapshotPort(database);
    const expected = database.prepare(ANDROID_COMPANION_NODE_RESOURCE_QUERY_DEFINITIONS.workspaceSnapshotNodes.sql).all('Phone');
    let transferredBytes = 0;
    const query = connection.query;
    vi.spyOn(connection, 'query').mockImplementation(async (sql, params) => {
      const result = await query(sql, params);
      transferredBytes += Buffer.byteLength(JSON.stringify(result.values));
      expect(JSON.stringify(result.values)).not.toContain('Body 1200');
      return result;
    });
    expect(await loadCompanionSnapshotNodeRows(port, 'Phone')).toEqual(expected);
    // The representative directory must remove at least 30% of bridge payload overhead.
    expect(transferredBytes).toBeLessThan(Buffer.byteLength(JSON.stringify(expected)) * 0.7);
    const snapshot = await loadIosCompanionWorkspaceSnapshot(port);
    expect(snapshot!.nodesById[snapshotNodeId(0)]!.initialReviewDue).toBe('2026-11-01T08:00:00.000Z');
  } finally { database.close(); }
});

it('reuses an owning transaction and releases it after a snapshot failure', async () => {
  const database = new Database(':memory:');
  try {
    seedSnapshotDatabase(database);
    const { connection, port } = snapshotPort(database);
    const begin = vi.spyOn(connection, 'beginTransaction');
    await port.transaction(tx => loadIosCompanionWorkspaceSnapshot(tx));
    expect(begin).toHaveBeenCalledTimes(1);
    vi.spyOn(connection, 'query').mockRejectedValueOnce(new Error('read failed'));
    await expect(loadIosCompanionWorkspaceSnapshot(port)).rejects.toThrow('read failed');
    expect(database.inTransaction).toBe(false);
    expect(await loadIosCompanionWorkspaceSnapshot(port)).not.toBeNull();
  } finally {
    database.close();
  }
});

it('returns an empty library without leaving its transaction open', async () => {
  const database = new Database(':memory:');
  try {
    seedSnapshotDatabase(database);
    database.pragma('foreign_keys = OFF');
    database.prepare('DELETE FROM nodes').run();
    expect(await loadIosCompanionWorkspaceSnapshot(snapshotPort(database).port)).toBeNull();
    expect(database.inTransaction).toBe(false);
  } finally {
    database.close();
  }
});
