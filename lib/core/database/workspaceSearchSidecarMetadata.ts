import {
  FULL_TEXT_SEARCH_INDEX_STRATEGY_SETTING_KEY,
  normalizeFullTextSearchIndexStrategy,
  resolveFullTextSearchIndexStrategy,
  type FullTextSearchIndexStrategy,
  type FullTextSearchTokenizer
} from './fullTextSearchIndexStrategy.js';
import type { DatabaseMigrationTarget } from './migrationTypes.js';

interface SearchMetadataRow {
  value_json?: unknown;
}

export interface WorkspaceSearchSidecarRebuildStatus {
  error?: string;
  status: 'failed' | 'ready' | 'rebuilding';
  strategy: FullTextSearchIndexStrategy;
  tokenizer: FullTextSearchTokenizer;
}

function readJsonObject(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'string') return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

export function readWorkspaceSearchMetadata(sqlite: DatabaseMigrationTarget, key: string) {
  const row = sqlite.prepare(
    'SELECT value_json FROM search.search_metadata WHERE key = ?'
  ).all(key)[0] as SearchMetadataRow | undefined;
  return readJsonObject(row?.value_json);
}

export function writeWorkspaceSearchMetadata(
  sqlite: DatabaseMigrationTarget,
  key: string,
  value: Record<string, unknown>
) {
  sqlite.prepare(
    `INSERT INTO search.search_metadata (key, value_json, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET
       value_json = excluded.value_json,
       updated_at = excluded.updated_at`
  ).run(key, JSON.stringify(value), new Date().toISOString());
}

export function createWorkspaceSearchMetadataTable(sqlite: DatabaseMigrationTarget) {
  sqlite.exec(`CREATE TABLE IF NOT EXISTS search.search_metadata (
    key TEXT PRIMARY KEY,
    value_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`);
}

export function tryWriteWorkspaceSearchMetadata(
  sqlite: DatabaseMigrationTarget,
  key: string,
  value: Record<string, unknown>
) {
  try {
    writeWorkspaceSearchMetadata(sqlite, key, value);
  } catch {
    // Metadata is diagnostic; do not let a sidecar status write re-break startup.
  }
}

export function toWorkspaceSearchSidecarRebuildStatus(
  value: Record<string, unknown> | null
): WorkspaceSearchSidecarRebuildStatus | null {
  if (value?.status !== 'failed' && value?.status !== 'ready' && value?.status !== 'rebuilding') return null;
  const resolution = resolveFullTextSearchIndexStrategy({
    [FULL_TEXT_SEARCH_INDEX_STRATEGY_SETTING_KEY]: normalizeFullTextSearchIndexStrategy(value.strategy)
  });
  const status: WorkspaceSearchSidecarRebuildStatus = {
    status: value.status,
    strategy: resolution.strategy,
    tokenizer: resolution.tokenizer
  };
  if (typeof value.error === 'string') status.error = value.error;
  return status;
}
