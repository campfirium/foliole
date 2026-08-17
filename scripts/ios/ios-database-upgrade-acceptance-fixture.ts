import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  ANDROID_COMPANION_MIGRATION_ACTION_TYPES,
  ANDROID_COMPANION_MIGRATION_PLAN
} from '../../lib/core/database/androidCompanionMigrationSchemaStatements.ts';
import { COMPANION_SCHEMA_STATEMENTS } from '../../lib/core/database/companionSchemaStatements.ts';
import { COMPANION_DATABASE_VERSION } from '../../lib/platform/nativeCompanionContract.ts';

const require = createRequire(import.meta.url);
const BetterSqlite3 = require('better-sqlite3') as typeof import('better-sqlite3');
const ACCEPTANCE_TIME = '2026-07-21T00:00:00.000Z';
const PROVENANCE_COLUMNS = ['import_source_fingerprint', 'import_content_fingerprint'] as const;

export function createIosDatabaseUpgradeFixture(databasePath: string) {
  assertLatestUpgradeFixtureProvenance();
  const sqlite = new BetterSqlite3(databasePath);
  try {
    sqlite.exec(COMPANION_SCHEMA_STATEMENTS.join(';\n'));
    sqlite.exec('DROP TABLE node_open_state');
    installLegacySyncObjectState(sqlite);
    seedPermanentState(sqlite);
    sqlite.pragma('user_version = 4');
    return readIosDatabaseUpgradeSnapshot(sqlite);
  } finally {
    sqlite.close();
  }
}

export function assertLatestUpgradeFixtureProvenance() {
  const commandStep = ANDROID_COMPANION_MIGRATION_PLAN.find((step) => step.beforeVersion === 5);
  if (!commandStep?.actions.some((action) =>
    action.type === ANDROID_COMPANION_MIGRATION_ACTION_TYPES.migrateSyncObjectStateSequence)) {
    throw new Error('The upgrade fixture no longer reaches the command migration contract.');
  }
  const latest = ANDROID_COMPANION_MIGRATION_PLAN.at(-1);
  const actionTypes = latest?.actions.map((action) => action.type);
  const expected = [
    ANDROID_COMPANION_MIGRATION_ACTION_TYPES.installSchema,
    ANDROID_COMPANION_MIGRATION_ACTION_TYPES.addSyncGroupsWorkgroupKeyIfMissing
  ];
  if (latest?.beforeVersion !== COMPANION_DATABASE_VERSION || JSON.stringify(actionTypes) !== JSON.stringify(expected)) {
    throw new Error('The upgrade fixture no longer matches the latest companion migration step.');
  }
}

export function readIosDatabaseUpgradeSnapshot(sqlite: import('better-sqlite3').Database) {
  const columns = sqlite.prepare("SELECT name FROM pragma_table_info('nodes') ORDER BY cid").all() as Array<{ name: string }>;
  return {
    attachment_count: count(sqlite, 'attachments'),
    attachment_mime_type: scalar(sqlite, "SELECT mime_type FROM attachments WHERE id = 'attachment-1'"),
    attachment_name: scalar(sqlite, "SELECT original_name FROM attachments WHERE id = 'attachment-1'"),
    attachment_role: scalar(sqlite, "SELECT role FROM node_attachments WHERE node_id = 'upgrade-node'"),
    blob_availability: scalar(sqlite, "SELECT availability FROM attachment_blobs WHERE attachment_id = 'attachment-1'"),
    blob_content_hash: scalar(sqlite, "SELECT content_hash FROM attachment_blobs WHERE attachment_id = 'attachment-1'"),
    cursor: meta(sqlite, 'sync_pack_cursor'),
    device_id: meta(sqlite, 'device_id'),
    node_count: count(sqlite, 'nodes'),
    open_state_table_exists: Number(Boolean(sqlite.prepare(
      "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'node_open_state'"
    ).get())),
    node_review_count: count(sqlite, 'node_review'),
    node_review_due: scalar(sqlite, "SELECT due FROM node_review WHERE node_id = 'upgrade-node'"),
    node_title: scalar(sqlite, "SELECT title FROM nodes WHERE id = 'upgrade-node'"),
    provenance_columns: columns.map(({ name }) => name).filter((name) => PROVENANCE_COLUMNS.includes(name as never)),
    resource_count: count(sqlite, 'attachment_blobs'),
    review_log_count: count(sqlite, 'review_log'),
    review_log_grade: scalar(sqlite, "SELECT grade FROM review_log WHERE id = 'review-1'"),
    review_log_op_id: scalar(sqlite, "SELECT op_id FROM review_log WHERE id = 'review-1'"),
    setting_count: count(sqlite, 'setting_records'),
    setting_value: scalar(sqlite, "SELECT value_json FROM setting_records WHERE key = 'theme'"),
    state_sequence_column: Number(Boolean(sqlite.prepare(
      "SELECT 1 FROM pragma_table_info('sync_object_state') WHERE name = 'state_seq'"
    ).get())),
    sync_state_count: count(sqlite, 'sync_object_state'),
    user_version: Number(sqlite.pragma('user_version', { simple: true })),
    view_count: count(sqlite, 'node_view_state'),
    view_scroll_top: scalar(sqlite, "SELECT scroll_top FROM node_view_state WHERE node_id = 'upgrade-node'"),
    view_source: scalar(sqlite, "SELECT source FROM node_view_state WHERE node_id = 'upgrade-node'")
  };
}

function installLegacySyncObjectState(sqlite: import('better-sqlite3').Database) {
  sqlite.exec(`DROP TABLE sync_object_state;
    CREATE TABLE sync_object_state (
      object_type TEXT NOT NULL, object_id TEXT NOT NULL, current_version_id TEXT,
      content_hash TEXT NOT NULL, last_modified_by_device_id TEXT NOT NULL,
      updated_at TEXT NOT NULL, deleted_at TEXT, sync_dirty INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (object_type, object_id)
    );
    INSERT INTO sync_object_state VALUES ('node', 'node-b', NULL, 'hash-b', 'ios-upgrade-device',
      '2026-07-21T02:00:00.000Z', NULL, 0);
    INSERT INTO sync_object_state VALUES ('node', 'node-a', NULL, 'hash-a', 'ios-upgrade-device',
      '2026-07-21T01:00:00.000Z', NULL, 1);`);
}

function seedPermanentState(sqlite: import('better-sqlite3').Database) {
  sqlite.exec(`
    INSERT INTO companion_meta VALUES ('device_id', 'ios-upgrade-device', '${ACCEPTANCE_TIME}');
    INSERT INTO companion_meta VALUES ('sync_pack_cursor', '41', '${ACCEPTANCE_TIME}');
    INSERT INTO nodes (id, title, created_at, updated_at) VALUES ('upgrade-node', 'Upgrade', '${ACCEPTANCE_TIME}', '${ACCEPTANCE_TIME}');
    INSERT INTO node_view_state VALUES ('upgrade-node', 'ios-upgrade-device', 42, NULL, NULL, 'user-scroll', '${ACCEPTANCE_TIME}');
    INSERT INTO node_review (node_id, due) VALUES ('upgrade-node', '${ACCEPTANCE_TIME}');
    INSERT INTO review_log VALUES ('review-1', 'op-1', 'ios-upgrade-device', 'upgrade-node', 3, 'fsrs-6', '${ACCEPTANCE_TIME}', '${ACCEPTANCE_TIME}', 1, 5, '${ACCEPTANCE_TIME}', 2, 4);
    INSERT INTO setting_records VALUES ('theme', 'device', 'ios', 'phone', 'ios-upgrade-device', '"dark"', 'setting-hash', '${ACCEPTANCE_TIME}', NULL);
    INSERT INTO attachments VALUES ('attachment-1', 'sample.png', 'image/png', 3, '${ACCEPTANCE_TIME}');
    INSERT INTO node_attachments VALUES ('upgrade-node', 'attachment-1', 'inline');
    INSERT INTO attachment_blobs (attachment_id, content_hash, size_bytes, mime_type, availability, created_at)
      VALUES ('attachment-1', 'resource-hash', 3, 'image/png', 'cached', '${ACCEPTANCE_TIME}');
  `);
}

function count(sqlite: import('better-sqlite3').Database, table: string) {
  return Number((sqlite.prepare(`SELECT count(*) AS count FROM ${table}`).get() as { count: number }).count);
}

function meta(sqlite: import('better-sqlite3').Database, key: string) {
  return (sqlite.prepare('SELECT value FROM companion_meta WHERE key = ?').get(key) as { value: string }).value;
}

function scalar(sqlite: import('better-sqlite3').Database, sql: string) {
  return Object.values(sqlite.prepare(sql).get() as Record<string, unknown>)[0];
}

const isMain = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  const databasePath = process.argv[2];
  if (!databasePath) throw new Error('iOS database upgrade fixture path is required.');
  process.stdout.write(`${JSON.stringify(createIosDatabaseUpgradeFixture(databasePath))}\n`);
}
