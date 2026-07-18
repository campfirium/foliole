import type { DatabaseDriver } from './driver.js';

export const WORKSPACE_SEARCH_SOURCE_IDENTITY_KEY = 'workspace_search_source_identity';
export const WORKSPACE_SEARCH_QUEUED_REVISION_KEY = 'workspace_search_queued_revision';
export const WORKSPACE_SEARCH_SOURCE_REVISION_KEY = 'workspace_search_source_revision';

const INDEXED_SOURCE_METADATA_KEY = 'indexed_source';
const ACTIVE_INVALIDATION_STATUSES = "'pending', 'running', 'failed'";

interface SettingRow {
  [column: string]: unknown;
  value: string;
}

interface SearchMetadataRow {
  [column: string]: unknown;
  value_json: string;
}

export interface WorkspaceSearchSourceState {
  identity: string;
  queuedRevision: number;
  revision: number;
}

interface IndexedWorkspaceSearchSourceState {
  identity: string;
  revision: number;
}

function nowIso() {
  return new Date().toISOString();
}

function readSetting(driver: DatabaseDriver, key: string) {
  return driver.queryOne<SettingRow>('SELECT value FROM settings WHERE key = ?', [key])?.value ?? null;
}

function writeSetting(driver: DatabaseDriver, key: string, value: string, updatedAt: string) {
  driver.execute(
    `INSERT INTO settings (key, value, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    [key, value, updatedAt]
  );
}

function parseRevision(value: string | null) {
  const revision = Number.parseInt(value ?? '', 10);
  return Number.isSafeInteger(revision) && revision >= 0 ? revision : null;
}

export function ensureWorkspaceSearchSourceState(driver: DatabaseDriver): WorkspaceSearchSourceState {
  const storedIdentity = readSetting(driver, WORKSPACE_SEARCH_SOURCE_IDENTITY_KEY)?.trim() || null;
  const storedQueuedRevision = parseRevision(readSetting(driver, WORKSPACE_SEARCH_QUEUED_REVISION_KEY));
  const storedRevision = parseRevision(readSetting(driver, WORKSPACE_SEARCH_SOURCE_REVISION_KEY));
  if (storedIdentity && storedQueuedRevision !== null && storedRevision !== null) {
    return { identity: storedIdentity, queuedRevision: storedQueuedRevision, revision: storedRevision };
  }
  const state = {
    identity: storedIdentity ?? globalThis.crypto.randomUUID(),
    queuedRevision: storedQueuedRevision ?? 0,
    revision: storedRevision ?? 0
  };
  const updatedAt = nowIso();
  writeSetting(driver, WORKSPACE_SEARCH_SOURCE_IDENTITY_KEY, state.identity, updatedAt);
  writeSetting(driver, WORKSPACE_SEARCH_QUEUED_REVISION_KEY, String(state.queuedRevision), updatedAt);
  writeSetting(driver, WORKSPACE_SEARCH_SOURCE_REVISION_KEY, String(state.revision), updatedAt);
  return state;
}

export function readWorkspaceSearchSourceState(driver: DatabaseDriver) {
  const identity = readSetting(driver, WORKSPACE_SEARCH_SOURCE_IDENTITY_KEY)?.trim() || null;
  const queuedRevision = parseRevision(readSetting(driver, WORKSPACE_SEARCH_QUEUED_REVISION_KEY));
  const revision = parseRevision(readSetting(driver, WORKSPACE_SEARCH_SOURCE_REVISION_KEY));
  return identity && queuedRevision !== null && revision !== null ? { identity, queuedRevision, revision } : null;
}

export function advanceWorkspaceSearchSourceRevision(driver: DatabaseDriver) {
  const current = ensureWorkspaceSearchSourceState(driver);
  const next = { ...current, revision: current.revision + 1 };
  writeSetting(driver, WORKSPACE_SEARCH_SOURCE_REVISION_KEY, String(next.revision), nowIso());
  return next;
}

export function markWorkspaceSearchSourceRevisionQueued(driver: DatabaseDriver) {
  const current = ensureWorkspaceSearchSourceState(driver);
  writeSetting(driver, WORKSPACE_SEARCH_QUEUED_REVISION_KEY, String(current.revision), nowIso());
  return { ...current, queuedRevision: current.revision };
}

export function readIndexedWorkspaceSearchSourceState(driver: DatabaseDriver) {
  const row = driver.queryOne<SearchMetadataRow>(
    'SELECT value_json FROM search.search_metadata WHERE key = ?',
    [INDEXED_SOURCE_METADATA_KEY]
  );
  if (!row) return null;
  try {
    const parsed = JSON.parse(row.value_json) as Partial<IndexedWorkspaceSearchSourceState>;
    return typeof parsed.identity === 'string' && Number.isSafeInteger(parsed.revision) && parsed.revision! >= 0
      ? { identity: parsed.identity, revision: parsed.revision! }
      : null;
  } catch {
    return null;
  }
}

export function clearIndexedWorkspaceSearchSourceState(driver: DatabaseDriver) {
  driver.execute('DELETE FROM search.search_metadata WHERE key = ?', [INDEXED_SOURCE_METADATA_KEY]);
}

export function hasActiveWorkspaceSearchInvalidations(driver: DatabaseDriver) {
  return Boolean(driver.queryOne(
    `SELECT 1 FROM search_index_invalidations WHERE status IN (${ACTIVE_INVALIDATION_STATUSES}) LIMIT 1`
  ));
}

export function markWorkspaceSearchSourceIndexedIfSettled(driver: DatabaseDriver) {
  if (hasActiveWorkspaceSearchInvalidations(driver)) return false;
  const state = readWorkspaceSearchSourceState(driver);
  if (!state || state.queuedRevision !== state.revision) return false;
  const indexedState: IndexedWorkspaceSearchSourceState = {
    identity: state.identity,
    revision: state.revision
  };
  driver.execute(
    `INSERT INTO search.search_metadata (key, value_json, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`,
    [INDEXED_SOURCE_METADATA_KEY, JSON.stringify(indexedState), nowIso()]
  );
  return true;
}

export function workspaceSearchSourceStateMatches(driver: DatabaseDriver) {
  const source = readWorkspaceSearchSourceState(driver);
  const indexed = readIndexedWorkspaceSearchSourceState(driver);
  return Boolean(
    source
    && indexed
    && source.queuedRevision === source.revision
    && source.identity === indexed.identity
    && source.revision === indexed.revision
  );
}

export function recoverInterruptedWorkspaceSearchInvalidations(driver: DatabaseDriver) {
  const recoveredAt = nowIso();
  return driver.execute(
    `UPDATE search_index_invalidations
     SET status = 'failed', updated_at = ?, claimed_at = NULL,
         last_error = COALESCE(last_error, 'interrupted_before_completion')
     WHERE status = 'running'`,
    [recoveredAt]
  ).changes;
}
