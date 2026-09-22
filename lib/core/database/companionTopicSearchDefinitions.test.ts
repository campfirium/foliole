// @vitest-environment node
import { DatabaseSync } from 'node:sqlite';

import { expect, it } from 'vitest';

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
