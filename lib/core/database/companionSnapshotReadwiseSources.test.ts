// @vitest-environment node
import { DatabaseSync } from 'node:sqlite';

import { expect, it } from 'vitest';

import { ANDROID_COMPANION_NODE_RESOURCE_QUERY_DEFINITIONS } from './androidCompanionNodeResourceQueryDefinitions.js';
import { COMPANION_CONTENT_SNAPSHOT_SQL } from './companionContentSnapshotQuery.js';
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

it('preserves body flags and collection headers in complete and scoped snapshots', () => {
  const db = new DatabaseSync(':memory:');
  try {
    for (const sql of COMPANION_SCHEMA_STATEMENTS) db.exec(sql);
    const bodies = ['', '   ', '\t', '\n', '\0', ' \0', 'Unicode 中文正文',
      '---', '---\n', '---\ncollections: [One]\n---\nBody',
      '---\r\ncollections: [One]\r\n---\r\nBody',
      '---\r\ncollections: [One]\n---\r\nBody', '---\r\r\nNot a header',
      '---\nUnclosed header', Buffer.from('---\ncollections: [Blob]\n---\nBody'),
      Buffer.from('Plain body'), `Ordinary body ${'large content '.repeat(10000)}`];
    const insert = db.prepare('INSERT INTO nodes (id,title,content,created_at,updated_at) VALUES (?,?,?,?,?)');
    bodies.forEach((body, index) => insert.run(`body-${index}`, 'Title', body, 'now', 'now'));
    const legacy = db.prepare(`SELECT id,
      CASE WHEN TRIM(COALESCE(content, '')) = '' THEN 'empty' ELSE 'ready' END AS body_status,
      CASE WHEN LENGTH(TRIM(COALESCE(content, ''))) > 0 THEN 1 ELSE 0 END AS has_content,
      CASE WHEN substr(replace(content, char(13) || char(10), char(10)), 1, 4) = '---' || char(10)
        THEN substr(replace(content, char(13) || char(10), char(10)), 1,
          instr(substr(replace(content, char(13) || char(10), char(10)), 5), char(10) || '---' || char(10)) + 8)
        ELSE NULL END AS collection_source_content
      FROM nodes ORDER BY id`).all();
    const full = db.prepare(ANDROID_COMPANION_NODE_RESOURCE_QUERY_DEFINITIONS.workspaceSnapshotNodes.sql).all('host');
    const ids = JSON.stringify(bodies.map((_, index) => `body-${index}`));
    const scoped = db.prepare(COMPANION_CONTENT_SNAPSHOT_SQL).all(ids, ids, 'host');
    for (const rows of [full, scoped]) {
      expect(rows.map(({ id, body_status, has_content, collection_source_content }) =>
        ({ id, body_status, has_content, collection_source_content })).sort((a, b) => String(a.id).localeCompare(String(b.id))))
        .toEqual(legacy);
    }
  } finally { db.close(); }
});
