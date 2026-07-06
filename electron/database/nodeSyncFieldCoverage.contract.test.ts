// @vitest-environment node

import Database from 'better-sqlite3';
import { expect, it } from 'vitest';


import { ANDROID_COMPANION_CORE_SCHEMA_STATEMENTS } from '../../lib/core/database/androidCompanionCoreSchemaStatements.js';
import { DESKTOP_CORE_SCHEMA_STATEMENTS } from '../../lib/core/database/desktopCoreSchemaStatements.js';
import { buildCanonicalNodeSyncPayload, type NodeSyncHashInput } from '../../lib/core/database/nodeSyncHash.js';
import { UPSERT_REMOTE_NODE_SQL } from '../../lib/core/sync/syncNodeApplyStatements.js';
import { buildSyncPackNodeUpsertSql } from '../../lib/core/sync/syncPackApplyStatements.js';
import type { NativeSyncNodeRecord } from '../../lib/platform/nativeSyncContract.js';

const NODE_SYNC_METADATA_COLUMNS = ['current_version_id', 'last_modified_by_device_id', 'sync_dirty'];
const NODE_HASH_SIDE_PAYLOAD_FIELDS = ['attachments'];
const NODE_BODY_HASH_PENDING_COLUMNS = ['body_blob_hash'];
const SYNC_PACK_NODE_UPSERT_PENDING_COLUMNS = [
  'anchor_link',
  'desired_retention',
  'enable_short_term',
  'image_regions',
  'last_modified_by_device_id',
  'manual_child_order',
  'position',
  'priority',
  'reveal',
  'sequential_reading_enabled',
  'sync_dirty',
  'virtual_filter'
];

const WIRE_SNAPSHOT_FIELDS = expectCompleteWireSnapshotFields([
  'anchor_link',
  'attachments',
  'body_blob_hash',
  'content',
  'created_at',
  'deleted_at',
  'desired_retention',
  'enable_short_term',
  'hide_title_heading',
  'id',
  'image_regions',
  'is_title_manual',
  'kind',
  'manual_child_order',
  'opening_text',
  'parent_id',
  'position',
  'priority',
  'reveal',
  'sequential_reading_enabled',
  'shelved_at',
  'title',
  'updated_at',
  'virtual_filter'
] as const);

it('keeps node sync field coverage explicit across schema, hash, snapshot, and apply paths', () => {
  const desktopColumns = loadNodeColumns(DESKTOP_CORE_SCHEMA_STATEMENTS);
  const androidColumns = loadNodeColumns(ANDROID_COMPANION_CORE_SCHEMA_STATEMENTS);

  expect(androidColumns).toEqual(desktopColumns);
  expectComparableFields(canonicalHashFields(), expectedHashPayloadFields(desktopColumns));
  expectComparableFields(desktopSnapshotFields(), expectedSnapshotFields(desktopColumns));
  expectComparableFields(remoteNodeUpsertColumns(), desktopColumns);
  expectComparableFields(wireSnapshotFields(), expectedSnapshotFields(desktopColumns));
  expect(syncPackNodeUpsertPendingColumns(desktopColumns)).toEqual(SYNC_PACK_NODE_UPSERT_PENDING_COLUMNS);
});

it('reports a contract drift when a companion node schema field is missing', () => {
  const desktopColumns = loadNodeColumns(DESKTOP_CORE_SCHEMA_STATEMENTS);
  const driftedAndroidColumns = loadNodeColumns(withoutNodeColumn(
    ANDROID_COMPANION_CORE_SCHEMA_STATEMENTS,
    'manual_child_order'
  ));

  expect(missingFields(desktopColumns, driftedAndroidColumns)).toEqual(['manual_child_order']);
});

function loadNodeColumns(statements: readonly string[]) {
  const database = new Database(':memory:');
  try {
    for (const statement of statements) database.exec(statement);
    const rows = database
      .prepare('PRAGMA table_xinfo("nodes")')
      .all() as Array<{ hidden: number; name: string }>;
    return rows
      .filter((row) => row.hidden === 0)
      .map((row) => row.name)
      .sort();
  } finally {
    database.close();
  }
}

function withoutNodeColumn(statements: readonly string[], column: string) {
  return statements.map((statement) => {
    if (!/^CREATE TABLE IF NOT EXISTS nodes\b/.test(statement.trim())) return statement;
    const linePattern = new RegExp(`\\n\\s*${column}\\s+[^,\\n]+,`);
    return statement.replace(linePattern, '');
  });
}

function canonicalHashFields() {
  return Object.keys(buildCanonicalNodeSyncPayload(nodeSyncInput())).sort();
}

function desktopSnapshotFields() {
  return [
    'anchor_link',
    'attachments',
    'body_blob_hash',
    'content',
    'created_at',
    'deleted_at',
    'desired_retention',
    'enable_short_term',
    'hide_title_heading',
    'id',
    'image_regions',
    'is_title_manual',
    'kind',
    'manual_child_order',
    'opening_text',
    'parent_id',
    'position',
    'priority',
    'reveal',
    'sequential_reading_enabled',
    'shelved_at',
    'title',
    'updated_at',
    'virtual_filter'
  ].sort();
}

function wireSnapshotFields() {
  return [...WIRE_SNAPSHOT_FIELDS].sort();
}

function remoteNodeUpsertColumns() {
  return extractInsertColumns(UPSERT_REMOTE_NODE_SQL, 'nodes');
}

function syncPackNodeUpsertColumns() {
  return extractInsertColumns(buildSyncPackNodeUpsertSql(), 'main.nodes');
}

function syncPackNodeUpsertPendingColumns(schemaColumns: string[]) {
  return missingFields(schemaColumns, syncPackNodeUpsertColumns()).sort();
}

function expectedHashPayloadFields(schemaColumns: string[]) {
  return [
    ...withoutFields(schemaColumns, [...NODE_SYNC_METADATA_COLUMNS, ...NODE_BODY_HASH_PENDING_COLUMNS]),
    ...NODE_HASH_SIDE_PAYLOAD_FIELDS
  ].sort();
}

function expectedSnapshotFields(schemaColumns: string[]) {
  return [
    ...withoutFields(schemaColumns, NODE_SYNC_METADATA_COLUMNS),
    ...NODE_HASH_SIDE_PAYLOAD_FIELDS
  ].sort();
}

function withoutFields(fields: readonly string[], excluded: readonly string[]) {
  const excludedSet = new Set(excluded);
  return fields.filter((field) => !excludedSet.has(field));
}

function missingFields(expected: readonly string[], actual: readonly string[]) {
  const actualSet = new Set(actual);
  return expected.filter((field) => !actualSet.has(field));
}

function expectComparableFields(actual: readonly string[], expected: readonly string[]) {
  expect(actual).toEqual([...expected].sort());
}

function extractInsertColumns(sql: string, table: string) {
  const escapedTable = table.replace('.', '\\.');
  const match = new RegExp(`INSERT(?: OR REPLACE)? INTO ${escapedTable} \\(([^)]+)\\)`, 's').exec(sql);
  if (!match?.[1]) {
    throw new Error(`Missing insert columns for ${table}`);
  }
  return match[1].split(',').map((field) => field.trim()).sort();
}

function nodeSyncInput(): NodeSyncHashInput {
  return {
    anchorLink: null,
    attachments: [],
    content: 'Body',
    createdAt: '2026-07-06T00:00:00.000Z',
    deletedAt: null,
    desiredRetention: null,
    enableShortTerm: null,
    sequentialReadingEnabled: null,
    shelvedAt: null,
    manualChildOrder: null,
    hideTitleHeading: false,
    id: 'node-1',
    imageRegions: null,
    isTitleManual: true,
    kind: 'topic',
    openingText: null,
    parentId: null,
    position: null,
    priority: null,
    reveal: null,
    title: 'Node',
    updatedAt: '2026-07-06T00:00:00.000Z',
    virtualFilter: null
  };
}

function expectCompleteWireSnapshotFields<const T extends readonly (keyof NativeSyncNodeRecord['snapshot'])[]>(
  fields: T & ([Exclude<keyof NativeSyncNodeRecord['snapshot'], T[number]>] extends [never]
    ? unknown
    : ['missing wire snapshot field', Exclude<keyof NativeSyncNodeRecord['snapshot'], T[number]>])
) {
  return fields;
}
