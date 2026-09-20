import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';
import { expect, it, vi } from 'vitest';

import { loadIosCompanionWorkspaceSnapshot } from './iosCompanionWorkspaceSnapshotStore';
import { seedSnapshotDatabase, SNAPSHOT_NODE_COUNT, snapshotNodeId, snapshotPort } from './iosCompanionWorkspaceSnapshotTestSupport';

it('preserves every body, original order and hidden descendants across bounded reads', async () => {
  const database = new Database(':memory:');
  try {
    seedSnapshotDatabase(database);
    const { connection, port } = snapshotPort(database);
    const sizes: number[] = [];
    const original = connection.query;
    vi.spyOn(connection, 'query').mockImplementation(async (sql, params) => {
      const result = await original(sql, params);
      if (result.values.some(row => Object.hasOwn(row as object, 'content'))) sizes.push(result.values.length);
      return result;
    });
    const snapshot = await loadIosCompanionWorkspaceSnapshot(port);
    expect(Object.keys(snapshot!.nodesById)).toHaveLength(SNAPSHOT_NODE_COUNT);
    expect(snapshot!.nodeOrder).toEqual(Array.from({ length: 1201 }, (_, index) => snapshotNodeId(1200 - index)));
    expect(snapshot!.trashedNodeIds).toEqual([snapshotNodeId(1201)]);
    for (let index = 0; index < SNAPSHOT_NODE_COUNT; index++) {
      const expected = index === 17 || index === 18 ? '' : index === 19 ? 'Blob 正文' : `Body ${index}`;
      expect(snapshot!.nodesById[snapshotNodeId(index)]!.content).toBe(expected);
    }
    expect(snapshot!.nodesById['node-0']!.attachments?.[0]?.originalName).toBe('original.pdf');
    expect(sizes.length).toBeGreaterThan(1);
    expect(Math.max(...sizes)).toBeLessThan(SNAPSHOT_NODE_COUNT);
    expect(sizes.reduce((sum, count) => sum + count, 0)).toBe(SNAPSHOT_NODE_COUNT);
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
      if (!committed && result.values.some(row => Object.hasOwn(row as object, 'content'))) {
        writer.transaction(() => {
          writer.prepare("UPDATE nodes SET title = 'New title' WHERE id = 'node-0'").run();
          writer.prepare("UPDATE attachments SET original_name = 'new.pdf'").run();
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
