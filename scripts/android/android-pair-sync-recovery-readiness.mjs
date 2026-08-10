import { createHash } from 'node:crypto';

function tableExists(database, table) {
  return database.prepare(
    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1"
  ).get(table) !== undefined;
}

function count(database, table, where = '') {
  if (!tableExists(database, table)) return null;
  return database.prepare(`SELECT COUNT(*) AS count FROM ${table}${where}`).get().count;
}

function meta(database, key) {
  if (!tableExists(database, 'companion_meta')) return null;
  return database.prepare('SELECT value FROM companion_meta WHERE key = ? LIMIT 1').get(key)?.value ?? null;
}

function latestFinishedSyncEvent(database) {
  const raw = meta(database, 'workspace_sync_events');
  if (!raw) return null;
  try {
    const events = JSON.parse(raw);
    return Array.isArray(events)
      ? events.find((event) => event?.kind === 'run_finished') ?? null : null;
  } catch { return null; }
}

function syncGroup(database) {
  if (!tableExists(database, 'sync_groups') || !tableExists(database, 'sync_group_local_state')) {
    return null;
  }
  return database.prepare(`SELECT groups.group_id, groups.timeline_id
    FROM sync_group_local_state local
    JOIN sync_groups groups ON groups.group_id = local.group_id
    WHERE local.singleton_id = 1 LIMIT 1`).get() ?? null;
}

function pairingCredentialRejection(event) {
  const rejected = event?.status === 'failed'
    && typeof event.message === 'string' && /\b401\b/u.test(event.message);
  const reason = rejected
    ? event.message.match(/\b(expired_timestamp|invalid_signature|missing_headers|unknown_device)\b/u)?.[1] ?? null
    : null;
  return { rejected, reason };
}

function waitingCount(event, key) {
  const value = event?.summary?.[key];
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

export function identityFingerprint(value) {
  return value ? createHash('sha256').update(value).digest('hex').slice(0, 16) : null;
}

export function inspectPairSyncRecoveryWorkspace(database) {
  const deviceId = meta(database, 'device_id');
  const latestSyncRun = latestFinishedSyncEvent(database);
  const rejection = pairingCredentialRejection(latestSyncRun);
  const group = syncGroup(database);
  return {
    activeSyncGroupMemberCount: count(database, 'sync_group_members', " WHERE state = 'active'"),
    deviceIdentityFingerprint: identityFingerprint(deviceId),
    dirtyRecordCount: count(
      database,
      'sync_object_state',
      " WHERE sync_dirty = 1 AND object_type <> 'view_state'"
    ),
    nodeCount: count(database, 'nodes'),
    latestSyncRunResult: typeof latestSyncRun?.result === 'string'
      ? latestSyncRun.result : null,
    latestSyncRunStatus: typeof latestSyncRun?.status === 'string'
      ? latestSyncRun.status : null,
    latestSyncWaitingConfirmationCount: waitingCount(
      latestSyncRun, 'waiting_confirmation_count'
    ),
    latestSyncWaitingSendCount: waitingCount(latestSyncRun, 'waiting_send_count'),
    pairingCredentialRejectionReason: rejection.reason,
    pairingCredentialsRejected: rejection.rejected,
    syncGroupId: group?.group_id ?? null,
    syncGroupTimelineId: group?.timeline_id ?? null
  };
}

export function pairSyncRecoveryReadiness(
  snapshot, pairingCredentialsPresent, remotePeerFingerprint = null, pairingPeerConflict = false,
  storedDeviceFingerprint = null
) {
  const inspection = snapshot.database?.inspection;
  const missingPrerequisites = [];
  if (!snapshot.packageInfo?.installed && !snapshot.database?.exists) {
    missingPrerequisites.push('app_missing');
  }
  if (!snapshot.database?.exists || snapshot.database.unreadable || !inspection) {
    missingPrerequisites.push('database_unavailable');
  }
  if (inspection && !inspection.deviceIdentityFingerprint) {
    missingPrerequisites.push('device_identity_missing');
  }
  if (inspection && (inspection.nodeCount ?? 0) > 1 && !pairingCredentialsPresent) {
    missingPrerequisites.push('nonempty_workspace_requires_review');
  }
  if (inspection && (inspection.dirtyRecordCount ?? 0) > 0) {
    missingPrerequisites.push('unsynced_device_data_requires_review');
  }
  if (pairingPeerConflict) {
    missingPrerequisites.push('existing_pairing_peer_conflict');
  } else if (pairingCredentialsPresent && !remotePeerFingerprint) {
    missingPrerequisites.push('existing_pairing_peer_unproven');
  }
  return {
    activeSyncGroupMemberCount: inspection?.activeSyncGroupMemberCount ?? null,
    deviceIdentityFingerprint: inspection?.deviceIdentityFingerprint ?? null,
    dirtyRecordCount: inspection?.dirtyRecordCount ?? null,
    missingPrerequisites,
    nodeCount: inspection?.nodeCount ?? null,
    latestSyncRunResult: inspection?.latestSyncRunResult ?? null,
    latestSyncRunStatus: inspection?.latestSyncRunStatus ?? null,
    latestSyncWaitingConfirmationCount:
      inspection?.latestSyncWaitingConfirmationCount ?? 0,
    latestSyncWaitingSendCount: inspection?.latestSyncWaitingSendCount ?? 0,
    pairingCredentialsPresent,
    pairingCredentialRejectionReason: inspection?.pairingCredentialRejectionReason ?? null,
    pairingCredentialsRejected: inspection?.pairingCredentialsRejected === true,
    pairingPeerConflict,
    remotePeerFingerprint,
    storedDeviceFingerprint,
    syncGroupId: inspection?.syncGroupId ?? null,
    syncGroupTimelineId: inspection?.syncGroupTimelineId ?? null,
    resultStatus: missingPrerequisites.length === 0 ? 'ready' : 'approval_required',
    schemaVersion: 1
  };
}
