import { normalizeImportManagerSettings } from '../import/importManagerSettings.js';

import type { DatabaseMigrationTarget } from './migrationTypes.js';
import { tableExists } from './numberedMigrationHelpers.js';
import { migrateSettingSingleTruth } from './numberedMigrationSettingSingleTruth.js';
import { SOURCE_OWNERSHIP_SCHEMA_STATEMENTS } from './sourceOwnershipSchemaStatements.js';
import { computeSyncContentHash } from './syncState.js';

const RETIRED_READWISE_TYPES = ['readwise_authority', 'readwise_binding', 'readwise_policy'] as const;
const EXPERIMENTAL_READWISE_TABLES = [
  'readwise_execution_authority',
  'readwise_import_policy',
  'readwise_legacy_binding_stage',
  'readwise_device_bindings'
] as const;

export function migrateDesktopSourceSimplification(sqlite: DatabaseMigrationTarget) {
  const migratedAt = new Date().toISOString();
  const legacySettings = readSetting(sqlite, 'import_manager_settings');
  const recovered = recoverReadwiseDraft(sqlite, legacySettings?.value);
  if (recovered) writeSetting(sqlite, 'readwise_device_settings', recovered, migratedAt);
  scrubLegacyImportManagerSetting(sqlite, legacySettings?.value, migratedAt);
  rebuildWatchedFolderBindings(sqlite);
  retireExperimentalReadwiseState(sqlite, migratedAt);
  migrateSettingSingleTruth(sqlite);
}

function recoverReadwiseDraft(sqlite: DatabaseMigrationTarget, legacyValue?: string) {
  if (readSetting(sqlite, 'readwise_device_settings')) return null;
  const candidates = [parseJson(legacyValue), ...EXPERIMENTAL_READWISE_TABLES.flatMap((table) =>
    tableExists(sqlite, table) ? readExperimentalRows(sqlite, table) : [])];
  const merged = Object.assign({}, ...candidates.filter(isRecord));
  const recoveredSources = recoverExperimentalSources(candidates);
  const normalized = normalizeImportManagerSettings(normalizeLegacyKeys(merged, recoveredSources));
  if (!normalized.readwiseRootPath && normalized.readwiseSources.every((source) => !source.primaryPath)) return null;
  return {
    confirmedAt: null,
    readwiseReaderConfig: { ...normalized.readwiseReaderConfig, enabled: false },
    readwiseRootPath: normalized.readwiseRootPath,
    readwiseSources: normalized.readwiseSources.map((source) => ({ ...source, keepState: 'draft' })),
    version: normalized.version
  };
}

function readExperimentalRows(sqlite: DatabaseMigrationTarget, table: string) {
  const rows = sqlite.prepare(`SELECT * FROM ${table}`).all();
  return rows.flatMap((row) => {
    if (!isRecord(row)) return [];
    const nested = Object.values(row).map((value) => parseJson(typeof value === 'string' ? value : undefined));
    return [row, ...nested.filter(isRecord)];
  });
}

function normalizeLegacyKeys(raw: Record<string, unknown>, recoveredSources: unknown[]) {
  const nestedConfig = firstRecord(raw.readwiseReaderConfig, raw.config, raw.config_json, raw.policy, raw.policy_json);
  const nestedSources = firstArray(raw.readwiseSources, raw.sources, raw.sources_json, raw.bindings_json);
  return {
    ...raw,
    readwiseReaderConfig: nestedConfig ?? raw.readwiseReaderConfig,
    readwiseRootPath: firstString(raw.readwiseRootPath, raw.readwise_root_path, raw.rootPath, raw.root_path),
    readwiseSources: nestedSources ?? (recoveredSources.length > 0 ? recoveredSources : raw.readwiseSources)
  };
}

function recoverExperimentalSources(candidates: unknown[]) {
  const byKind = new Map<string, Record<string, unknown>>();
  for (const candidate of candidates) {
    if (!isRecord(candidate)) continue;
    const kind = firstString(candidate.kind, candidate.source_kind, candidate.sourceKind);
    if (!['articles', 'books', 'tweets', 'podcasts'].includes(kind)) continue;
    const primaryPath = firstString(candidate.primaryPath, candidate.primary_path);
    const highlightPath = firstString(candidate.highlightPath, candidate.highlight_path);
    if (!primaryPath && !highlightPath) continue;
    byKind.set(kind, {
      actionMode: firstString(candidate.actionMode, candidate.action_mode) || 'keep',
      archivePath: firstString(candidate.archivePath, candidate.archive_path),
      highlightMode: firstString(candidate.highlightMode, candidate.highlight_mode) || 'split',
      highlightPath,
      id: firstString(candidate.id, candidate.binding_id) || `legacy-readwise-${kind}`,
      keepState: 'draft',
      kind,
      primaryPath
    });
  }
  return [...byKind.values()];
}

function scrubLegacyImportManagerSetting(
  sqlite: DatabaseMigrationTarget,
  value: string | undefined,
  updatedAt: string
) {
  const raw = parseJson(value);
  if (!isRecord(raw)) return;
  const scrubbed = { ...raw };
  for (const key of [
    'readwiseActiveDeviceName', 'readwiseActiveInstallationId', 'readwiseCurrentDeviceName',
    'readwiseCurrentInstallationId', 'readwiseReaderConfig', 'readwiseRootPath',
    'readwiseSettingsConfirmed', 'readwiseSources'
  ]) delete scrubbed[key];
  writeSetting(sqlite, 'import_manager_settings', scrubbed, updatedAt);
}

function rebuildWatchedFolderBindings(sqlite: DatabaseMigrationTarget) {
  if (!tableExists(sqlite, 'watched_folder_bindings')) {
    for (const statement of SOURCE_OWNERSHIP_SCHEMA_STATEMENTS) sqlite.exec(statement);
    return;
  }
  sqlite.exec('DROP INDEX IF EXISTS idx_watched_folder_bindings_owner');
  sqlite.exec('DROP INDEX IF EXISTS idx_watched_folder_bindings_owner_path');
  sqlite.exec('ALTER TABLE watched_folder_bindings RENAME TO watched_folder_bindings_v69_legacy');
  for (const statement of SOURCE_OWNERSHIP_SCHEMA_STATEMENTS) sqlite.exec(statement);
  sqlite.exec(`INSERT INTO watched_folder_bindings (
    binding_id, owner_installation_id, owner_device_name, owner_platform, action_mode, archive_path,
    highlight_mode, highlight_path, keep_preview_json, primary_path, enabled, availability,
    created_at, updated_at, deleted_at
  ) SELECT binding_id, owner_installation_id, owner_device_name, owner_platform, action_mode, archive_path,
    highlight_mode, highlight_path, keep_preview_json, primary_path,
    CASE WHEN owner_installation_id IS NULL THEN 0 ELSE enabled END, availability,
    created_at, updated_at, deleted_at FROM watched_folder_bindings_v69_legacy`);
  sqlite.exec('DROP TABLE watched_folder_bindings_v69_legacy');
}

function retireExperimentalReadwiseState(sqlite: DatabaseMigrationTarget, updatedAt: string) {
  if (tableExists(sqlite, 'sync_object_state')) {
    for (const objectType of RETIRED_READWISE_TYPES) {
      const contentHash = computeSyncContentHash(objectType, null);
      sqlite.prepare(
        `UPDATE sync_object_state SET content_hash = ?, deleted_at = COALESCE(deleted_at, ?),
         updated_at = ?, sync_dirty = 1 WHERE object_type = ?`
      ).run(contentHash, updatedAt, updatedAt, objectType);
    }
  }
  for (const table of EXPERIMENTAL_READWISE_TABLES) sqlite.exec(`DROP TABLE IF EXISTS ${table}`);
}

function writeSetting(sqlite: DatabaseMigrationTarget, key: string, value: unknown, updatedAt: string) {
  sqlite.prepare(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  ).run(key, JSON.stringify(value), updatedAt);
}

function readSetting(sqlite: DatabaseMigrationTarget, key: string) {
  if (!tableExists(sqlite, 'settings')) return undefined;
  return sqlite.prepare('SELECT value, updated_at FROM settings WHERE key = ?').all(key)[0] as
    { updated_at: string; value: string } | undefined;
}

function parseJson(value?: string): unknown {
  if (!value) return null;
  try { return JSON.parse(value) as unknown; } catch { return null; }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function firstRecord(...values: unknown[]) {
  return values.map((value) => typeof value === 'string' ? parseJson(value) : value).find(isRecord);
}

function firstArray(...values: unknown[]) {
  return values.map((value) => typeof value === 'string' ? parseJson(value) : value).find(Array.isArray);
}

function firstString(...values: unknown[]) {
  return values.find((value): value is string => typeof value === 'string' && value.length > 0) ?? '';
}
