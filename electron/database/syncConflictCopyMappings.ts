import type { DatabaseDriver } from '../../lib/core/database/driver.js';

const CONFLICT_COPY_KEY_PREFIX = 'sync_conflict_copy:';
const CONFLICT_COPY_BRANCH_KEY_PREFIX = 'sync_conflict_copy_branch:';

function conflictCopyMappingKey(versionId: string) {
  return `${CONFLICT_COPY_KEY_PREFIX}${versionId}`;
}

function conflictCopyBranchMappingKey(objectId: string, sourceDeviceId: string) {
  return `${CONFLICT_COPY_BRANCH_KEY_PREFIX}${encodeURIComponent(objectId)}:${encodeURIComponent(sourceDeviceId)}`;
}

interface ConflictCopyBranchMapping {
  copyNodeId: string;
  sourceVersionCreatedAt: string | null;
  sourceVersionId: string | null;
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

export function loadConflictCopyBranchMapping(driver: DatabaseDriver, objectId: string, sourceDeviceId: string) {
  const value = driver.queryOne<{ value: string }>('SELECT value FROM settings WHERE key = ?', [
    conflictCopyBranchMappingKey(objectId, sourceDeviceId)
  ])?.value ?? null;
  if (!value) {
    return null;
  }
  try {
    const parsed = JSON.parse(value) as Partial<ConflictCopyBranchMapping>;
    return parsed.copyNodeId
      ? {
          copyNodeId: parsed.copyNodeId,
          sourceVersionCreatedAt: parsed.sourceVersionCreatedAt ?? null,
          sourceVersionId: parsed.sourceVersionId ?? null
        }
      : { copyNodeId: value, sourceVersionCreatedAt: null, sourceVersionId: null };
  } catch {
    return { copyNodeId: value, sourceVersionCreatedAt: null, sourceVersionId: null };
  }
}

export function saveConflictCopyBranchMapping(
  driver: DatabaseDriver,
  objectId: string,
  sourceDeviceId: string,
  copyNodeId: string,
  now: string,
  sourceVersionId: string | null,
  sourceVersionCreatedAt: string | null
) {
  driver.execute(
    `INSERT INTO settings (key, value, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    [
      conflictCopyBranchMappingKey(objectId, sourceDeviceId),
      JSON.stringify({ copyNodeId, sourceVersionCreatedAt, sourceVersionId }),
      now
    ]
  );
}
