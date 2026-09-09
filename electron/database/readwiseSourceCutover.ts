import {
  normalizeReadwiseSourceCutover,
  readwiseSourceCutoverProgress,
  READWISE_SOURCE_CUTOVER_JOURNAL_KEY,
  READWISE_SOURCE_CUTOVER_KEY,
  READWISE_SOURCE_CUTOVER_VERSION,
  type LegacyReadwiseSourceCutover,
  type ReadwiseSourceCutover
} from '../../lib/core/readwise/readwiseSourceCutover.js';

import { openDatabaseConnection } from './connection.js';
import { writeJsonSetting } from './settingsStore.js';

export function loadReadwiseSourceCutover() {
  const journal = loadCutoverSetting(READWISE_SOURCE_CUTOVER_JOURNAL_KEY);
  return normalizeReadwiseSourceCutover(journal ?? loadCutoverSetting(READWISE_SOURCE_CUTOVER_KEY));
}

export function loadReadwiseSourceMigrationProgress() {
  const state = loadReadwiseSourceCutover();
  if (!state || state.version !== 2) return { completedCount: 0, totalCount: 0 };
  const totalCount = openDatabaseConnection().driver.queryOne<{ count: number }>(
    `SELECT COUNT(DISTINCT i.latest_node_id) count FROM import_sources i
     JOIN desktop_sources d ON d.source_ref = i.source_ref
     JOIN nodes n ON n.id = i.latest_node_id AND n.deleted_at IS NULL
     WHERE d.source_type = 'readwise' AND d.host_name = ?`,
    [state.sourceHost]
  )?.count ?? 0;
  const completedCount = new Set(state.documents.flatMap((item) =>
    item.status === 'bound' && item.nodeId ? [item.nodeId] : []
  )).size;
  return { completedCount: Math.min(completedCount, totalCount), totalCount };
}

export function writeReadwiseSourceCutover(
  input: Omit<ReadwiseSourceCutover, 'version'>,
  now = input.completedAt
) {
  const value: ReadwiseSourceCutover = { ...input, version: READWISE_SOURCE_CUTOVER_VERSION };
  const progress = readwiseSourceCutoverProgress(value);
  const legacy = {
    completedAt: value.completedAt,
    completedCandidateCount: progress.completedCandidateCount,
    migratedCount: progress.migratedCount,
    sourceHost: value.sourceHost,
    startedAt: value.startedAt,
    status: value.status,
    totalCandidateCount: progress.totalCandidateCount,
    unmatchedCount: progress.unmatchedCount,
    version: 1
  };
  openDatabaseConnection().driver.transaction((driver) => {
    writeJsonSetting(driver, READWISE_SOURCE_CUTOVER_JOURNAL_KEY, value, now);
    writeJsonSetting(driver, READWISE_SOURCE_CUTOVER_KEY, legacy, now);
  });
  return value;
}

export function writeLegacyReadwiseSourceCutover(
  input: Omit<LegacyReadwiseSourceCutover, 'version'>,
  now = input.completedAt
) {
  const value = { ...input, version: 1 as const };
  openDatabaseConnection().driver.transaction((driver) => {
    writeJsonSetting(driver, READWISE_SOURCE_CUTOVER_KEY, value, now);
  });
  return value;
}

function loadCutoverSetting(key: string) {
  const row = openDatabaseConnection().driver.queryOne<{ value: string }>(
    'SELECT value FROM settings WHERE key = ?',
    [key]
  );
  if (!row) return null;
  try {
    return JSON.parse(row.value) as unknown;
  } catch {
    throw new Error(`readwise_source_cutover_invalid_json:${key}`);
  }
}
