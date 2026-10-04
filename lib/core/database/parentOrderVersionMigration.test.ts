import Database from 'better-sqlite3';
import { expect, it } from 'vitest';


import { createBetterSqliteDbPort } from '../../../electron/database/betterSqliteDbPort.js';
import { PARENT_ORDER_BASELINE_TIME,
  parentOrderBaselineVersionId } from '../sync/syncParentOrderVersionStore.js';

import { migrateCompanionParentOrderVersions,
  migrateParentOrderVersions } from './parentOrderVersionMigration.js';
import { SYNC_SCHEMA_STATEMENTS } from './syncSchemaStatements.js';

it('captures each legacy current arrangement as a stable baseline without inventing edits', () => {
  const sqlite = new Database(':memory:');
  for (const statement of SYNC_SCHEMA_STATEMENTS) sqlite.exec(statement);
  try {
    sqlite.exec(`CREATE TABLE parent_child_order (
      parent_id TEXT PRIMARY KEY, child_ids_json TEXT NOT NULL, updated_at TEXT NOT NULL
    )`);
    sqlite.prepare('INSERT INTO parent_child_order VALUES (?, ?, ?)')
      .run('root', '["b","a"]', 'old-time');
    migrateParentOrderVersions(sqlite);
    const id = parentOrderBaselineVersionId('root', ['b', 'a']);
    expect(sqlite.prepare('SELECT * FROM parent_order_versions').get()).toMatchObject({
      version_id: id, parent_id: 'root', kind: 'baseline',
      child_ids_json: '["b","a"]', parent_version_ids_json: '[]',
      created_at: PARENT_ORDER_BASELINE_TIME
    });
    expect(sqlite.prepare('SELECT version_id FROM parent_order_heads').pluck().get()).toBe(id);
  } finally { sqlite.close(); }
});

it('seeds the same baseline identity through the companion migration path', async () => {
  const sqlite = new Database(':memory:');
  for (const statement of SYNC_SCHEMA_STATEMENTS) sqlite.exec(statement);
  try {
    sqlite.exec(`CREATE TABLE parent_child_order (
      parent_id TEXT PRIMARY KEY, child_ids_json TEXT NOT NULL, updated_at TEXT NOT NULL
    ); INSERT INTO parent_child_order VALUES ('root', '["b","a"]', 'old-time')`);
    await migrateCompanionParentOrderVersions(createBetterSqliteDbPort(sqlite));
    expect(sqlite.prepare('SELECT version_id FROM parent_order_heads').pluck().get())
      .toBe(parentOrderBaselineVersionId('root', ['b', 'a']));
  } finally { sqlite.close(); }
});
