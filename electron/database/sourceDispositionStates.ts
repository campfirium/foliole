import path from 'node:path';

import type { DatabaseDriver, DatabaseRow } from '../../lib/core/database/driver.js';
import { loadImportManagerSettings } from '../import/importManagerSettings.js';

import { openDatabaseConnection } from './connection.js';
import {
  clearReadwiseApiNodeDisposition,
  recordReadwiseApiNodeDisposition
} from './readwiseApiSourceDispositions.js';

export type SourceDisposition = 'dismissed' | 'hard_deleted' | 'soft_deleted';

export interface SourceDispositionSummary {
  recordCount: number;
  sizeBytes: number;
}

export interface SourceDispositionRestoreResult {
  dismissedCount: number;
  trashedCount: number;
}

export interface SourceDispositionRecord extends DatabaseRow, SourceDispositionKey {
  disposition: SourceDisposition;
  updatedAt: string;
}

export interface SourceDispositionImportRecord {
  disposition: SourceDisposition;
  originalTitle: string;
  sourceKind: SourceDispositionKey['sourceKind'];
}

export interface SourceDispositionKey {
  originalTitle: string;
  sourceKind: 'keep' | 'readwise';
  sourceScope: string;
}

export interface SourceKeyRow extends DatabaseRow {
  rule_id: string;
  source_path: string;
  title: string | null;
}

function normalizeRelativePath(value: string) {
  return value.replace(/\\/g, '/');
}

function resolveSourceScope(ruleId: string, sourcePath: string) {
  const directory = path.posix.dirname(normalizeRelativePath(sourcePath));
  return `${ruleId}:${directory || '.'}`;
}

export function readReadwiseRuleIds() {
  return new Set(loadImportManagerSettings().readwiseSources.map((source) => source.id));
}

function toSourceKind(ruleId: string, readwiseRuleIds = readReadwiseRuleIds()): SourceDispositionKey['sourceKind'] {
  return readwiseRuleIds.has(ruleId) ? 'readwise' : 'keep';
}

export function toSourceDispositionKey(row: SourceKeyRow, readwiseRuleIds = readReadwiseRuleIds()): SourceDispositionKey | null {
  const title = row.title?.trim();
  if (!title) {
    return null;
  }
  return {
    originalTitle: title,
    sourceKind: toSourceKind(row.rule_id, readwiseRuleIds),
    sourceScope: resolveSourceScope(row.rule_id, row.source_path)
  };
}

export function sourceDispositionKeyId(key: SourceDispositionKey) {
  return `${key.sourceKind}\u0000${key.sourceScope}\u0000${key.originalTitle}`;
}

/** One scan for the whole set (last_node_id is not indexed); each node takes its earliest import item. */
function readSourceKeysForNodes(driver: DatabaseDriver, nodeIds: readonly string[]) {
  const keys = new Map<string, SourceDispositionKey | null>();
  if (!nodeIds.length) {
    return keys;
  }
  const rows = driver.queryAll<SourceKeyRow & { node_id: string }>(
    `SELECT item.last_node_id AS node_id, item.rule_id, item.source_path, cache.title
     FROM keep_import_items item
     LEFT JOIN keep_import_item_cache cache
       ON cache.rule_id = item.rule_id
      AND cache.source_path = item.source_path
     WHERE item.last_node_id IN (SELECT value FROM json_each(?))
     ORDER BY item.rowid`,
    [JSON.stringify(nodeIds)]
  );
  if (!rows.length) {
    return keys;
  }
  const readwiseRuleIds = readReadwiseRuleIds();
  for (const row of rows) {
    if (!keys.has(row.node_id)) {
      keys.set(row.node_id, toSourceDispositionKey(row, readwiseRuleIds));
    }
  }
  return keys;
}

function readSourceKeysByTitle(driver: DatabaseDriver, record: SourceDispositionImportRecord) {
  const readwiseRuleIds = readReadwiseRuleIds();
  return driver.queryAll<SourceKeyRow>(
    `SELECT item.rule_id, item.source_path, cache.title
     FROM keep_import_items item
     LEFT JOIN keep_import_item_cache cache
       ON cache.rule_id = item.rule_id
      AND cache.source_path = item.source_path
     WHERE cache.title = ?`,
    [record.originalTitle]
  ).flatMap((row) => {
    const key = toSourceDispositionKey(row, readwiseRuleIds);
    return key && key.sourceKind === record.sourceKind ? [key] : [];
  });
}

function runSourceDispositionUpsert(driver: DatabaseDriver, key: SourceDispositionKey, disposition: SourceDisposition, updatedAt: string) {
  driver.execute(
    `INSERT INTO source_disposition_states (source_kind, source_scope, original_title, disposition, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(source_kind, source_scope, original_title) DO UPDATE SET
       disposition = excluded.disposition,
       updated_at = excluded.updated_at`,
    [key.sourceKind, key.sourceScope, key.originalTitle, disposition, updatedAt]
  );
}

function runSourceDispositionDelete(driver: DatabaseDriver, key: SourceDispositionKey) {
  driver.execute(
    `DELETE FROM source_disposition_states
     WHERE source_kind = ? AND source_scope = ? AND original_title = ?`,
    [key.sourceKind, key.sourceScope, key.originalTitle]
  );
}

function recordNodeSourceDispositionsWithDriver(
  driver: DatabaseDriver,
  entries: ReadonlyArray<{ nodeId: string; updatedAt: string }>,
  disposition: SourceDisposition
) {
  const keys = readSourceKeysForNodes(driver, entries.map((entry) => entry.nodeId));
  for (const { nodeId, updatedAt } of entries) {
    if (recordReadwiseApiNodeDisposition(driver, nodeId, disposition, updatedAt)) {
      continue;
    }
    const key = keys.get(nodeId);
    if (key) {
      runSourceDispositionUpsert(driver, key, disposition, updatedAt);
    }
  }
}

export function recordNodeSourceDispositionWithDriver(
  driver: DatabaseDriver,
  nodeId: string,
  disposition: SourceDisposition,
  updatedAt: string
) {
  recordNodeSourceDispositionsWithDriver(driver, [{ nodeId, updatedAt }], disposition);
}

export function recordNodeSourceDisposition(nodeId: string, disposition: SourceDisposition, updatedAt: string) {
  recordNodeSourceDispositionWithDriver(openDatabaseConnection().driver, nodeId, disposition, updatedAt);
}

export function recordNodeSourceDispositions(nodeIds: readonly string[], disposition: SourceDisposition, updatedAt: string) {
  recordTimedNodeSourceDispositions(nodeIds.map((nodeId) => ({ nodeId, updatedAt })), disposition);
}

export function recordTimedNodeSourceDispositions(entries: ReadonlyArray<{ nodeId: string; updatedAt: string }>, disposition: SourceDisposition) {
  recordNodeSourceDispositionsWithDriver(openDatabaseConnection().driver, entries, disposition);
}

export function clearNodeSourceDispositions(nodeIds: readonly string[]) {
  const { driver } = openDatabaseConnection();
  const keys = readSourceKeysForNodes(driver, nodeIds);
  for (const nodeId of nodeIds) {
    clearReadwiseApiNodeDisposition(driver, nodeId);
    const key = keys.get(nodeId);
    if (key) {
      runSourceDispositionDelete(driver, key);
    }
  }
}

export function clearNodeSourceDisposition(nodeId: string) {
  clearNodeSourceDispositions([nodeId]);
}

export function summarizeSourceDispositions(): SourceDispositionSummary {
  const row = openDatabaseConnection().driver.queryOne<{ record_count: number; size_bytes: number }>(
    `SELECT COUNT(*) AS record_count,
            COALESCE(SUM(length(source_kind) + length(source_scope) + length(original_title) + length(disposition) + length(updated_at)), 0) AS size_bytes
     FROM source_disposition_states`
  );
  return {
    recordCount: row?.record_count ?? 0,
    sizeBytes: row?.size_bytes ?? 0
  };
}

export function listSourceDispositionRecords(): SourceDispositionRecord[] {
  return openDatabaseConnection().driver.queryAll<SourceDispositionRecord>(
    `SELECT source_kind AS sourceKind,
            source_scope AS sourceScope,
            original_title AS originalTitle,
            disposition,
            updated_at AS updatedAt
     FROM source_disposition_states
     ORDER BY source_kind ASC, source_scope ASC, original_title ASC`
  );
}

export function mergeSourceDispositionRecords(records: SourceDispositionRecord[]) {
  const driver = openDatabaseConnection().driver;
  for (const record of records) {
    runSourceDispositionUpsert(driver, record, record.disposition, record.updatedAt);
  }
  return summarizeSourceDispositions();
}

export function mergeImportedSourceDispositionRecords(records: SourceDispositionImportRecord[]) {
  const driver = openDatabaseConnection().driver;
  const updatedAt = new Date().toISOString();
  let importedCount = 0;
  for (const record of records) {
    const keys = readSourceKeysByTitle(driver, record);
    for (const key of keys) {
      runSourceDispositionUpsert(driver, key, record.disposition, updatedAt);
      importedCount += 1;
    }
  }
  return {
    importedCount,
    summary: summarizeSourceDispositions()
  };
}

export function resetSourceDispositions() {
  openDatabaseConnection().driver.execute('DELETE FROM source_disposition_states');
  return summarizeSourceDispositions();
}
