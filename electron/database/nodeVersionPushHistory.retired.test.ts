// @vitest-environment node
import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { includeRetainedNodePushHistory } from '../../lib/core/sync/nodeVersionPushHistory.js';
import { loadCurrentSyncNodeRecord, loadStoredSyncNodeVersionRecord,
  loadStoredSyncNodeVersionRecords } from '../../lib/core/sync/syncNodeGraph.js';
import { isNodeVersionIdentityOnly } from '../../lib/core/sync/syncNodeVersionHistory.js';

import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';
import { seedCurrentBody } from './currentVersionBodyBlob.testSupport.js';

function history() {
  const db = new Database(':memory:');
  seedCurrentBody(db, 'complete current head');
  const insert = db.prepare(`INSERT INTO node_sync_versions (version_id, object_id,
    parent_version_id, host_name, created_at, content_hash, body_text, snapshot_json)
    VALUES (?, 'article', ?, 'original-host', ?, ?, ?, ?)`);
  for (const [id, parent, at] of [['base', null, '2026-01-01'], ['middle', 'base', '2026-01-02']]) {
    insert.run(id, parent, at, `hash-${id}`, `original-${id}`,
      JSON.stringify({ id: 'article', content: `original-${id}`, updated_at: at }));
  }
  db.exec(`UPDATE node_sync_versions SET parent_version_id = 'middle',
      created_at = '2026-01-03' WHERE version_id = 'head';
    INSERT INTO node_sync_version_parents VALUES ('middle', 'base', 0);
    INSERT INTO node_sync_version_parents VALUES ('head', 'middle', 0);`);
  const identities = db.prepare(`SELECT version_id, object_id, parent_version_id,
    content_hash, host_name, created_at FROM node_sync_versions ORDER BY version_id`).all();
  const parents = db.prepare('SELECT * FROM node_sync_version_parents ORDER BY version_id, ordinal').all();
  db.exec(`UPDATE node_sync_versions SET body_text = NULL,
    snapshot_json = json_set(snapshot_json, '$.content', NULL) WHERE version_id = 'middle'`);
  return { db, port: createBetterSqliteDbPort(db), identities, parents };
}

it('forwards retained history with a retired middle body as its original identity and parent path', async () => {
  const f = history();
  try {
    const head = await loadCurrentSyncNodeRecord(f.port, 'article');
    expect(head?.body_text).toBe('complete current head');
    if (!head) throw new Error('fixture_current_head_missing');
    const records = await includeRetainedNodePushHistory(f.port, [head]);
    expect(records.map((row) => row.version_id)).toEqual(['base', 'middle', 'head']);
    const retired = records.find((row) => row.version_id === 'middle');
    expect(retired).toMatchObject({ object_id: 'article', content_hash: 'hash-middle',
      host_name: 'original-host', version_created_at: '2026-01-02', body_text: null,
      parent_version_id: 'base', parent_version_ids: ['base'], ancestor_version_ids: ['base'],
      snapshot: { id: 'article', content: null, updated_at: '2026-01-02' } });
    expect(retired && isNodeVersionIdentityOnly(retired)).toBe(true);
    expect(records.at(-1)).toMatchObject({ version_id: 'head', body_text: 'complete current head',
      parent_version_ids: ['middle'], ancestor_version_ids: ['middle', 'base'] });
    expect(f.db.prepare(`SELECT version_id, object_id, parent_version_id,
      content_hash, host_name, created_at FROM node_sync_versions ORDER BY version_id`).all()).toEqual(f.identities);
    expect(f.db.prepare('SELECT * FROM node_sync_version_parents ORDER BY version_id, ordinal').all()).toEqual(f.parents);
    expect(await includeRetainedNodePushHistory(f.port, records)).toEqual(records);
  } finally { f.db.close(); }
});

it('keeps strict stored text readers from accepting retired bodies while the current head remains readable', async () => {
  const f = history();
  try {
    await expect(loadStoredSyncNodeVersionRecord(f.port, 'middle'))
      .rejects.toThrow('sync_node_version_body_unavailable:middle');
    await expect(loadStoredSyncNodeVersionRecords(f.port, ['middle', 'head']))
      .rejects.toThrow('sync_node_version_body_unavailable:middle');
    expect(await loadCurrentSyncNodeRecord(f.port, 'article')).toMatchObject({
      version_id: 'head', body_text: 'complete current head' });
  } finally { f.db.close(); }
});
