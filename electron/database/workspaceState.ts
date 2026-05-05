import { openDatabaseConnection } from './connection.js';

const WORKSPACE_STATE_KEY_PREFIX = 'workspace_state:';

function sanitizeStorageKey(storageKey: string): string {
  const isValidLength = storageKey.length > 0 && storageKey.length <= 128;
  if (!isValidLength) {
    throw new Error('workspace storage key has invalid length');
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(storageKey)) {
    throw new Error('workspace storage key contains unsupported characters');
  }
  return storageKey;
}

function resolveWorkspaceStateKey(storageKey: string): string {
  return `${WORKSPACE_STATE_KEY_PREFIX}${sanitizeStorageKey(storageKey)}`;
}

export function loadWorkspaceStateFromSqlite(storageKey: string): string | null {
  const connection = openDatabaseConnection();
  const key = resolveWorkspaceStateKey(storageKey);
  const result = connection.sqlite
    .prepare('SELECT value FROM settings WHERE key = ? LIMIT 1')
    .get(key) as { value: string } | undefined;
  return result?.value ?? null;
}

export function saveWorkspaceStateToSqlite(storageKey: string, payload: string): void {
  const connection = openDatabaseConnection();
  const key = resolveWorkspaceStateKey(storageKey);
  const updatedAt = new Date().toISOString();
  connection.sqlite
    .prepare(
      `INSERT INTO settings (key, value, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
    )
    .run(key, payload, updatedAt);
}

export function clearWorkspaceStateFromSqlite(storageKey: string): void {
  const connection = openDatabaseConnection();
  const key = resolveWorkspaceStateKey(storageKey);
  connection.sqlite.prepare('DELETE FROM settings WHERE key = ?').run(key);
}
