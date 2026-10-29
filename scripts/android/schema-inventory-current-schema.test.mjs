// @vitest-environment node

import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { ATTACHMENT_REFERENCE_CACHE_SCHEMA } from '../../lib/core/database/attachmentReferenceCacheSchema.ts';
import { DAILY_FLOW_SYNC_MERGE_INDEXES } from '../../lib/core/database/dailyFlowSyncMergeMigration.ts';
import { DAILY_FLOW_SYNC_SCHEMA } from '../../lib/core/database/dailyFlowSyncSchema.ts';
import { loadDesktopFreshSchemaStatements, loadAndroidSchemaAssetStatements } from './schema-inventory.mjs';

function schemaObjects(statements) {
  const database = new Database(':memory:');
  try {
    const isTrigger = statement => /^CREATE\s+TRIGGER/iu.test(statement.trim());
    for (const statement of [...statements.filter(statement => !isTrigger(statement)), ...statements.filter(isTrigger)]) {
      database.exec(statement);
    }
    return database.prepare("SELECT name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY name")
      .all().map(({ name, sql }) => ({ name, sql: sql.replace(/\s+/g, ' ').trim() }));
  } finally {
    database.close();
  }
}

it.each([
  ['desktop', loadDesktopFreshSchemaStatements],
  ['Android', loadAndroidSchemaAssetStatements]
])('inventories the current shared attachment and daily list schema on %s', (_host, load) => {
  const expected = schemaObjects([
    ...ATTACHMENT_REFERENCE_CACHE_SCHEMA,
    ...DAILY_FLOW_SYNC_SCHEMA,
    ...DAILY_FLOW_SYNC_MERGE_INDEXES
  ]);
  const expectedNames = new Set(expected.map(({ name }) => name));

  expect(schemaObjects(load()).filter(({ name }) => expectedNames.has(name))).toEqual(expected);
});
