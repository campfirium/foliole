const FINGERPRINT = /^[0-9a-f]{16}$/u;

function validDirtyEntries(counts) {
  if (!counts || typeof counts !== 'object' || Array.isArray(counts)) return null;
  const entries = Object.entries(counts);
  if (entries.some(([type, count]) => !type
      || !Number.isSafeInteger(count) || count <= 0)) return null;
  return entries;
}

export function hasCompleteDirtyStateEvidence(readiness) {
  const total = readiness?.dirtyRecordCount;
  if (!Number.isSafeInteger(total) || total < 0) return false;
  const entries = validDirtyEntries(readiness.dirtyObjectCounts);
  if (!entries) return false;
  const classifiedTotal = entries.reduce((sum, [, count]) => sum + count, 0);
  return classifiedTotal === total && (total === 0 || entries.length > 0);
}

export function hasProtectedPendingSyncState(readiness) {
  const missing = readiness?.missingPrerequisites;
  return readiness?.schemaVersion === 1
    && readiness.resultStatus === 'approval_required'
    && Array.isArray(missing)
    && missing.length === 1
    && missing[0] === 'unsynced_device_data_requires_review'
    && readiness.dirtyRecordCount > 0
    && hasCompleteDirtyStateEvidence(readiness)
    && FINGERPRINT.test(readiness.localMemberAuthorizationFingerprint ?? '')
    && readiness.syncGroupCredentialsPresent === true
    && readiness.workgroupKeyPresent === true
    && readiness.syncGroupRoutePresent === true
    && typeof readiness.syncGroupId === 'string'
    && readiness.syncGroupId.length > 0
    && readiness.syncGroupId === readiness.storedSyncGroupId
    && typeof readiness.syncGroupTimelineId === 'string'
    && readiness.syncGroupTimelineId.length > 0
    && readiness.syncGroupTimelineId === readiness.storedSyncGroupTimelineId
    && Number.isSafeInteger(readiness.activeSyncGroupMemberCount)
    && readiness.activeSyncGroupMemberCount >= 2;
}
