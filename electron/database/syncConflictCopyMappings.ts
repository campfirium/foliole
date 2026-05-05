import type { DatabaseDriver } from '../../lib/core/database/driver.js';

const CONFLICT_COPY_KEY_PREFIX = 'sync_conflict_copy:';

function conflictCopyMappingKey(versionId: string) {
  return `${CONFLICT_COPY_KEY_PREFIX}${versionId}`;
}

export function loadConflictCopyMapping(driver: DatabaseDriver, versionId: string) {
  return driver.queryOne<{ value: string }>('SELECT value FROM settings WHERE key = ?', [
    conflictCopyMappingKey(versionId)
  ])?.value ?? null;
}

export function saveConflictCopyMapping(driver: DatabaseDriver, versionId: string, copyNodeId: string, now: string) {
  driver.execute(
    `INSERT INTO settings (key, value, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    [conflictCopyMappingKey(versionId), copyNodeId, now]
  );
}
