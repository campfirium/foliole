// @vitest-environment node

import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { initializeDatabaseSchema } from '../../lib/core/database/migrations.js';
import { syncIdentityPartition } from '../../lib/core/sync/syncIdentityDigest.js';
import { readSyncIdentityNodeFactGlobalPage } from '../../lib/core/sync/syncIdentityNodeFactGlobalRead.js';
import { buildSyncIdentityNodeFactIndex } from '../../lib/core/sync/syncIdentityNodeFactIndex.js';
import { readSyncIdentityNodeFactDescriptorPage } from '../../lib/core/sync/syncIdentityNodeFactPage.js';

import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';

it('pages fixed-view version and parent metadata without sending body text', async () => {
  const db = new Database(':memory:');
  try {
    initializeDatabaseSchema(db);
    db.exec(`INSERT INTO nodes (id, kind, title, current_version_id, created_at, updated_at)
      VALUES ('topic', 'topic', 'Topic', 'v129', 'now', 'now')`);
    const version = db.prepare(`INSERT INTO node_sync_versions
      (version_id, object_id, parent_version_id, host_name, created_at,
       content_hash, body_text, snapshot_json) VALUES (?, 'topic', ?, 'A', 'now', ?, ?, ?)`);
    const edge = db.prepare(`INSERT INTO node_sync_version_parents
      (version_id, parent_version_id, ordinal) VALUES (?, ?, 0)`);
    for (let index = 0; index < 130; index += 1) {
      const id = `v${String(index).padStart(3, '0')}`;
      const parent = index ? `v${String(index - 1).padStart(3, '0')}` : null;
      version.run(id, parent, id, `body-${id}`, JSON.stringify({ content: `body-${id}` }));
      if (parent) edge.run(id, parent);
    }
    db.prepare(`INSERT INTO sync_identity_index_rows
      (object_type, object_id, partition, fingerprint, updated_at)
      VALUES ('node', 'topic', ?, 'state', 'now')`)
      .run(syncIdentityPartition('node', 'topic'));
    const port = createBetterSqliteDbPort(db);
    await buildSyncIdentityNodeFactIndex(port);
    const read = (section: 'versions' | 'parents' | 'requirements', after: string | null) =>
      readSyncIdentityNodeFactDescriptorPage(port, { nodeId: 'topic', section, after });
    const first = await read('versions', null);
    expect(first.entries).toHaveLength(128);
    expect(first.nextAfter).toBe('v127');
    expect(JSON.stringify(first)).not.toContain('body-v000');
    expect((await read('versions', first.nextAfter)).entries).toHaveLength(2);
    const parents = await read('parents', null);
    expect(parents.entries).toHaveLength(128);
    expect(parents.nextAfter).toBe(JSON.stringify(['v128', 0, 'v127']));
    expect((await read('parents', parents.nextAfter)).entries).toHaveLength(1);
    expect((await read('requirements', null)).entries).toEqual([
      { version_id: 'v129', frozen: 0 }
    ]);
    await expect(read('parents', 'not-json'))
      .rejects.toThrow('sync_identity_node_fact_cursor_invalid');
  } finally { db.close(); }
});

it('continues fact summary pages when long IDs exhaust the byte budget', async () => {
  const db = new Database(':memory:');
  try {
    db.exec(`CREATE TABLE sync_identity_node_facts (
      node_id TEXT PRIMARY KEY, partition INTEGER NOT NULL, digest TEXT NOT NULL,
      requirements_digest TEXT NOT NULL, state_fingerprint TEXT NOT NULL,
      repair_required INTEGER NOT NULL DEFAULT 0)`);
    const insert = db.prepare(`INSERT INTO sync_identity_node_facts
      (node_id, partition, digest, requirements_digest, state_fingerprint)
      VALUES (?, 7, ?, ?, ?)`);
    for (let index = 0; index < 130; index += 1) {
      insert.run(`${String(index).padStart(3, '0')}-${'x'.repeat(700)}`,
        'a'.repeat(64), 'b'.repeat(64), 'c'.repeat(64));
    }
    const port = createBetterSqliteDbPort(db);
    const ids: string[] = [];
    let after: string | null = null;
    do {
      const page = await readSyncIdentityNodeFactGlobalPage(port, after === null ? null :
        { object_type: 'node', object_id: after });
      expect(new TextEncoder().encode(JSON.stringify(page.entries)).length)
        .toBeLessThanOrEqual(65536);
      ids.push(...page.entries.map((entry) => entry.object_id));
      after = page.nextAfter?.object_id ?? null;
    } while (after !== null);
    expect(ids).toHaveLength(130);
    expect(new Set(ids).size).toBe(130);
  } finally { db.close(); }
});
