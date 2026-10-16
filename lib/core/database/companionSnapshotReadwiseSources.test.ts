// @vitest-environment node
import { DatabaseSync } from 'node:sqlite';

import { expect, it } from 'vitest';

import { ANDROID_COMPANION_NODE_RESOURCE_QUERY_DEFINITIONS } from './androidCompanionNodeResourceQueryDefinitions.js';
import { COMPANION_SCHEMA_STATEMENTS } from './companionSchemaStatements.js';

it('keeps the latest Readwise lifecycle without scanning all sources once per node', () => {
  const db = new DatabaseSync(':memory:');
  try {
    for (const sql of COMPANION_SCHEMA_STATEMENTS) db.exec(sql);
    const insertNode = db.prepare('INSERT INTO nodes (id,title,created_at,updated_at) VALUES (?, ?, ?, ?)');
    for (let index = 0; index < 1000; index++) insertNode.run(`node-${index}`, 'Topic', 'now', 'now');
    const insertSource = db.prepare(`INSERT INTO import_sources
      (source_fingerprint, provider, source_kind, source_name, source_locator,
       first_imported_at, last_imported_at, last_content_fingerprint, latest_node_id,
       remote_provider, remote_import_state_json) VALUES (?, 'test', 'test', 'test', 'test',
       '2026-01-01', ?, 'content', ?, ?, ?)`);
    for (let index = 0; index < 1000; index++) {
      insertSource.run(`old-${index}`, '2026-01-01', `node-${index}`, 'readwise', '{"remoteLifecycle":"active"}');
      insertSource.run(`new-${index}`, '2026-02-01', `node-${index}`, 'readwise', '{"remoteLifecycle":"archived"}');
    }
    insertNode.run('no-source', 'Plain', 'now', 'now');
    insertSource.run('unrelated', '2026-03-01', 'node-0', 'other', '{"remoteLifecycle":"deleted"}');
    insertSource.run('detached', '2026-03-01', null, 'readwise', '{"remoteLifecycle":"deleted"}');
    const sql = ANDROID_COMPANION_NODE_RESOURCE_QUERY_DEFINITIONS.workspaceSnapshotNodes.sql;
    const rows = db.prepare(sql).all('host');
    expect(rows).toHaveLength(1001);
    expect(rows.filter(row => row.id !== 'no-source').every(row => row.readwise_remote_lifecycle === 'archived')).toBe(true);
    expect(rows.find(row => row.id === 'no-source')?.readwise_remote_lifecycle).toBeNull();
    const plan = db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all('host');
    const correlated = plan.filter(row => String(row.detail).includes('CORRELATED')).map(row => row.id);
    const repeatedScans = plan.filter(row => correlated.includes(row.parent) && /^SCAN /.test(String(row.detail)));
    expect(repeatedScans).toEqual([]);
  } finally {
    db.close();
  }
});
