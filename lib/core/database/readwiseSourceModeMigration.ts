import {
  normalizeReadwiseSourceMode,
  normalizeLegacyReadwiseSourceMode,
  READWISE_SOURCE_MODE_CONFLICT_KEY,
  READWISE_SOURCE_MODE_KEY,
  type ReadwiseSourceMode
} from '../import/readwiseSourceMode.js';
import { READWISE_SOURCE_CUTOVER_COMPLETION_VERSION } from '../readwise/readwiseSourceCutover.js';

import type { DatabaseMigrationTarget } from './migrationTypes.js';
import { tableExists } from './numberedMigrationHelpers.js';
import { computeSyncContentHash } from './syncState.js';

const LEGACY_KEYS = ['readwise_import_settings', 'import_manager_settings'] as const;
const CUTOVER_KEYS = ['readwise_source_cutover', 'readwise_source_cutover_v2'] as const;

interface StoredValue {
  key: string;
  updatedAt: string;
  value: unknown;
}

export function migrateReadwiseSourceMode(sqlite: DatabaseMigrationTarget) {
  if (!tableExists(sqlite, 'settings')) return;
  const values = readRelevantValues(sqlite);
  const resolution = resolveLegacyState(values);
  stripLegacyModes(sqlite);
  writeUserSpaceSetting(sqlite, READWISE_SOURCE_MODE_KEY, {
    ...(resolution.completion ? { completion: resolution.completion } : {}),
    mode: resolution.mode,
    version: 1
  }, resolution.updatedAt);
  if (resolution.reasons.length > 0) {
    writeUserSpaceSetting(sqlite, READWISE_SOURCE_MODE_CONFLICT_KEY, {
      reasons: resolution.reasons,
      version: 1
    }, resolution.updatedAt);
  }
}

function readRelevantValues(sqlite: DatabaseMigrationTarget) {
  const keys = [...LEGACY_KEYS, ...CUTOVER_KEYS];
  const placeholders = keys.map(() => '?').join(', ');
  const projection = sqlite.prepare(
    `SELECT key, value, updated_at FROM settings WHERE key IN (${placeholders})`
  ).all(...keys) as Array<{ key: string; updated_at: string; value: string }>;
  const canonical = tableExists(sqlite, 'setting_records')
    ? sqlite.prepare(
      `SELECT key, value_json value, updated_at FROM setting_records WHERE key IN (${placeholders})`
    ).all(...keys) as Array<{ key: string; updated_at: string; value: string }>
    : [];
  return [...projection, ...canonical].map((row): StoredValue => ({
    key: row.key,
    updatedAt: row.updated_at,
    value: parse(row.value, row.key)
  }));
}

function resolveLegacyState(values: StoredValue[]) {
  const modes = values.flatMap((item) => LEGACY_KEYS.includes(item.key as never)
    ? legacyMode(item.value) : []);
  const uniqueModes = [...new Set(modes)];
  const cutovers = values.filter((item) => CUTOVER_KEYS.includes(item.key as never));
  const v1 = cutovers.filter((item) => record(item.value).version === 1).map((item) => record(item.value));
  const v2 = cutovers.filter((item) => record(item.value).version === 2).map((item) => record(item.value));
  const completed = v2.some(isCurrentCompletion);
  const migrating = [...v1, ...v2].some((item) => item.status === 'migration-in-progress');
  const reasons: string[] = [];
  if (uniqueModes.length > 1) reasons.push('legacy_mode_conflict');
  if (v1.length > 0 && v2.length > 0 && statuses(v1) !== statuses(v2)) reasons.push('cutover_version_conflict');
  const explicit = uniqueModes[0] ?? null;
  if (explicit === 'api' && !completed) reasons.push('api_without_completion_proof');
  if ((explicit === 'relay' || explicit === 'off') && completed) reasons.push('completion_conflicts_with_mode');
  if (explicit === 'api' && migrating) reasons.push('api_while_migration_in_progress');
  if (!explicit && cutovers.length > 0) reasons.push('mode_missing_for_existing_readwise_state');
  return {
    completion: completed ? completionProof(v2.find(isCurrentCompletion)!) : null,
    mode: explicit ?? (cutovers.length > 0 ? 'off' : 'relay'),
    reasons: [...new Set(reasons)].sort(),
    updatedAt: values.map((item) => item.updatedAt).sort().at(-1) ?? '1970-01-01T00:00:00.000Z'
  };
}

function completionProof(value: Record<string, unknown>) {
  return {
    batchId: typeof value.batchId === 'string' ? value.batchId : null,
    completedAt: String(value.completedAt),
    sourceHost: String(value.sourceHost),
    startedAt: String(value.startedAt)
  };
}

function legacyMode(value: unknown): ReadwiseSourceMode[] {
  const mode = normalizeLegacyReadwiseSourceMode(record(value).readwiseSourceMode);
  return mode ? [mode] : [];
}

function isCurrentCompletion(value: Record<string, unknown>) {
  if (value.status !== 'api'
    || value.completionVersion !== READWISE_SOURCE_CUTOVER_COMPLETION_VERSION
    || !Array.isArray(value.cohortDocumentIds) || !Array.isArray(value.documents)
    || !Array.isArray(value.annotations)) return false;
  const terminals = new Set(value.documents.flatMap((item) => {
    const row = record(item);
    return typeof row.remoteId === 'string' ? [row.remoteId] : [];
  }));
  return value.cohortDocumentIds.every((id) => typeof id === 'string' && terminals.has(id));
}

export function invalidateLegacyReadwiseSourceCompletion(
  sqlite: DatabaseMigrationTarget,
  now = new Date().toISOString()
) {
  if (!tableExists(sqlite, 'settings')) return;
  const row = sqlite.prepare('SELECT value FROM settings WHERE key = ? LIMIT 1')
    .all(READWISE_SOURCE_MODE_KEY)[0] as { value?: string } | undefined;
  if (!row?.value) return;
  const setting = normalizeReadwiseSourceMode(parse(row.value, READWISE_SOURCE_MODE_KEY));
  const hasCurrentCompletion = readRelevantValues(sqlite)
    .filter((item) => item.key === 'readwise_source_cutover_v2')
    .some((item) => isCurrentCompletion(record(item.value)));
  if (hasCurrentCompletion) return;
  writeUserSpaceSetting(sqlite, READWISE_SOURCE_MODE_KEY, {
    mode: setting.mode === 'api' ? 'relay' : setting.mode,
    version: 1
  }, now);
  writeUserSpaceSetting(sqlite, READWISE_SOURCE_MODE_CONFLICT_KEY, {
    reasons: [], version: 1
  }, now);
}

function statuses(values: Array<Record<string, unknown>>) {
  return [...new Set(values.map((item) => String(item.status ?? 'api')))].sort().join(',');
}

function stripLegacyModes(sqlite: DatabaseMigrationTarget) {
  for (const key of LEGACY_KEYS) {
    const projection = sqlite.prepare('SELECT value, updated_at FROM settings WHERE key = ?')
      .all(key) as Array<{ updated_at: string; value: string }>;
    for (const row of projection) updateProjection(sqlite, key, withoutMode(parse(row.value, key)), row.updated_at);
    if (!tableExists(sqlite, 'setting_records')) continue;
    const records = sqlite.prepare(
      'SELECT value_json, updated_at FROM setting_records WHERE key = ?'
    ).all(key) as Array<{ updated_at: string; value_json: string }>;
    for (const row of records) updateCanonicalValues(sqlite, key, withoutMode(parse(row.value_json, key)));
  }
}

function updateProjection(sqlite: DatabaseMigrationTarget, key: string, value: unknown, updatedAt: string) {
  sqlite.prepare('UPDATE settings SET value = ?, updated_at = ? WHERE key = ?')
    .run(JSON.stringify(value), updatedAt, key);
}

function updateCanonicalValues(sqlite: DatabaseMigrationTarget, key: string, value: unknown) {
  const valueJson = JSON.stringify(value);
  const rows = sqlite.prepare(
    'SELECT scope, platform, form_factor, host_name, updated_at FROM setting_records WHERE key = ?'
  ).all(key) as Array<Record<string, string>>;
  for (const row of rows) writeCanonicalRow(sqlite, key, valueJson, row, false);
}

function writeUserSpaceSetting(sqlite: DatabaseMigrationTarget, key: string, value: unknown, updatedAt: string) {
  const valueJson = JSON.stringify(value);
  const row = { form_factor: 'desktop', host_name: '*', platform: 'windows', scope: 'user_space', updated_at: updatedAt };
  sqlite.prepare(`INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`)
    .run(key, valueJson, updatedAt);
  if (tableExists(sqlite, 'setting_records')) writeCanonicalRow(sqlite, key, valueJson, row, true);
}

function writeCanonicalRow(
  sqlite: DatabaseMigrationTarget,
  key: string,
  valueJson: string,
  row: Record<string, string>,
  insert: boolean
) {
  const contentHash = computeSyncContentHash('setting', {
    form_factor: row.form_factor, host_name: row.host_name, key,
    platform: row.platform, scope: row.scope, value_json: valueJson
  });
  if (insert) {
    sqlite.prepare(`INSERT INTO setting_records
      (key, scope, platform, form_factor, host_name, value_json, content_hash, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(key, scope, platform, form_factor, host_name) DO UPDATE SET
        value_json = excluded.value_json, content_hash = excluded.content_hash,
        updated_at = excluded.updated_at, deleted_at = NULL`)
      .run(key, row.scope, row.platform, row.form_factor, row.host_name, valueJson, contentHash, row.updated_at);
  } else {
    sqlite.prepare(`UPDATE setting_records SET value_json = ?, content_hash = ?
      WHERE key = ? AND scope = ? AND platform = ? AND form_factor = ? AND host_name = ?`)
      .run(valueJson, contentHash, key, row.scope, row.platform, row.form_factor, row.host_name);
  }
  writeSyncState(sqlite, key, contentHash, row);
}

function writeSyncState(sqlite: DatabaseMigrationTarget, key: string, contentHash: string, row: Record<string, string>) {
  if (!tableExists(sqlite, 'sync_object_state')) return;
  const objectId = `${row.scope}:${row.platform}:${row.form_factor}:${row.host_name}:${key}`;
  sqlite.prepare(`INSERT INTO sync_object_state
    (object_type, object_id, state_seq, content_hash, last_modified_by_host_name, updated_at, sync_dirty)
    VALUES ('setting', ?, COALESCE((SELECT MAX(state_seq) + 1 FROM sync_object_state), 1), ?, ?, ?, 1)
    ON CONFLICT(object_type, object_id) DO UPDATE SET state_seq = excluded.state_seq,
      content_hash = excluded.content_hash, last_modified_by_host_name = excluded.last_modified_by_host_name,
      updated_at = excluded.updated_at, deleted_at = NULL, sync_dirty = 1`)
    .run(objectId, contentHash, migrationHost(sqlite), row.updated_at);
}

function migrationHost(sqlite: DatabaseMigrationTarget) {
  const row = sqlite.prepare("SELECT value FROM settings WHERE key = 'host_name'").all()[0] as { value?: string } | undefined;
  if (!row?.value) return 'readwise-source-mode-migration';
  try { return String(JSON.parse(row.value)); } catch { return row.value; }
}

function withoutMode(value: unknown) {
  const next = { ...record(value) };
  delete next.readwiseSourceMode;
  return next;
}

function parse(value: string, key: string) {
  try { return JSON.parse(value) as unknown; }
  catch { throw new Error(`readwise_source_mode_migration_invalid_json:${key}`); }
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
}
