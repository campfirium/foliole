// @vitest-environment node
import { DatabaseSync } from 'node:sqlite';

import { expect, it } from 'vitest';

import { ANDROID_COMPANION_NODE_RESOURCE_QUERY_DEFINITIONS } from './androidCompanionNodeResourceQueryDefinitions.js';
import { COMPANION_SCHEMA_STATEMENTS } from './companionSchemaStatements.js';
import { COMPANION_TOPIC_SEARCH_QUERY } from './companionTopicSearchDefinitions.js';

it('follows parent links without repeatedly scanning all live nodes during topic search', () => {
  const db = new DatabaseSync(':memory:');
  try {
    for (const sql of COMPANION_SCHEMA_STATEMENTS) db.exec(sql);
    const insert = db.prepare('INSERT INTO nodes (id, parent_id, title, content, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
    insert.run('root', null, 'Root', '', '2026-09-22', '2026-09-22', null);
    insert.run('visible', 'root', 'Visible match', 'needle', '2026-09-22', '2026-09-22', null);
    insert.run('deleted', null, 'Deleted parent', '', '2026-09-22', '2026-09-22', '2026-09-22');
    insert.run('hidden', 'deleted', 'Hidden match', 'needle', '2026-09-22', '2026-09-22', null);
    const sql = COMPANION_TOPIC_SEARCH_QUERY.sql;
    const params = [...Array((sql.match(/\?/g) ?? []).length - 1).fill('needle'), 20];
    expect(db.prepare(sql).all(...params).map((row) => row.id)).toEqual(['visible']);
    const plan = db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...params);
    const recursiveStep = plan.find((row) => row.detail === 'RECURSIVE STEP')!;
    const recursiveWork = plan.filter((row) => row.parent === recursiveStep.id).map((row) => String(row.detail));
    expect(recursiveWork.some((detail) => /SEARCH child.*\(parent_id=\?\)/.test(detail))).toBe(true);
  } finally {
    db.close();
  }
});

it('searches complete current bodies and reports their availability independently of retired blobs', () => {
  const db = new DatabaseSync(':memory:');
  try {
    for (const sql of COMPANION_SCHEMA_STATEMENTS) db.exec(sql);
    const insert = db.prepare('INSERT INTO nodes (id,title,content,body_blob_hash,created_at,updated_at) VALUES (?,?,?,?,?,?)');
    const body = 'Current 中文 😀 ' + 'x'.repeat(1024 * 1024) + ' complete-tail';
    insert.run('current', 'Current', body, 'absent-retired-blob', 'now', 'now');
    insert.run('empty', 'Empty', '', 'absent-retired-blob', 'now', 'now');
    const sql = COMPANION_TOPIC_SEARCH_QUERY.sql;
    const search = (query: string) => db.prepare(sql).all(
      ...Array((sql.match(/\?/g) ?? []).length - 1).fill(query), 20
    );
    expect(search('complete-tail')).toEqual([expect.objectContaining({
      id: 'current', content_status: 'ready', excerpt: expect.stringContaining('complete-tail')
    })]);
    expect(search('empty')).toEqual([expect.objectContaining({ id: 'empty', content_status: 'empty' })]);
    const snapshot = db.prepare(ANDROID_COMPANION_NODE_RESOURCE_QUERY_DEFINITIONS.workspaceSnapshotNodes.sql).all('test');
    expect(snapshot).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'current', body_status: 'ready', has_content: 1 }),
      expect.objectContaining({ id: 'empty', body_status: 'empty', has_content: 0 })
    ]));
  } finally {
    db.close();
  }
});
