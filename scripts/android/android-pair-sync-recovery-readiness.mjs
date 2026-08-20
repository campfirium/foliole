import { createHash } from 'node:crypto';

import {
  currentDeliveryStatusCountsByPeerFingerprint,
  pendingDeliveryCountsByPeerFingerprint
} from './android-pair-sync-peer-delivery-readiness.mjs';
import {
  inspectStoredSyncGroup, inspectSyncGroupBinding, inspectWorkgroupKeyPresent
} from './android-sync-group-readiness-inspection.mjs';
import {
  authorizationFingerprint, inspectLocalActiveMemberAuthorizationFingerprint
} from './android-sync-group-authorization-inspection.mjs';
import {
  classifySyncFailure, classifySyncFailureRoute, classifySyncFailureStage
} from './android-sync-failure-classification.mjs';

function tableExists(database, table) {
  return database.prepare(
    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1"
  ).get(table) !== undefined;
}

function count(database, table, where = '') {
  if (!tableExists(database, table)) return null;
  return database.prepare(`SELECT COUNT(*) AS count FROM ${table}${where}`).get().count;
}

function dirtyObjectCounts(database) {
  if (!tableExists(database, 'sync_object_state')) return {};
  const statement = database.prepare(`SELECT object_type, COUNT(*) AS count
    FROM sync_object_state WHERE sync_dirty = 1 AND object_type <> 'view_state'
    GROUP BY object_type ORDER BY object_type`);
  if (typeof statement.all !== 'function') return {};
  return Object.fromEntries(statement.all().map((row) => [row.object_type, Number(row.count)]));
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

function pairingCredentialRejection(event) {
  const failedMessage = event?.status === 'failed' && typeof event.message === 'string'
    ? event.message : '';
  const localSigningUnavailable = failedMessage.includes('Failed to sign companion sync request.');
  const rejected = localSigningUnavailable || /\b401\b/u.test(failedMessage);
  const reason = rejected
    ? (localSigningUnavailable ? 'local_signing_unavailable'
      : failedMessage.match(/\b(expired_timestamp|invalid_signature|missing_headers|unknown_device)\b/u)?.[1] ?? null)
    : null;
  return { rejected, reason };
}

function waitingCount(event, key) {
  const value = event?.summary?.[key];
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

function scalar(database, sql) {
  const statement = database.prepare(sql);
  if (typeof statement.pluck === 'function') return Number(statement.pluck().get() ?? 0);
  const row = statement.get();
  return Number(row?.count ?? row?.value ?? 0);
}

function protectedContentDigest(database) {
  const rows = ['attachments', 'content_blobs', 'nodes', 'review_log'].flatMap((table) => {
    if (!tableExists(database, table)) return [];
    const statement = database.prepare(`SELECT * FROM ${table}`);
    if (typeof statement.all !== 'function') return [];
    return statement.all().map((row) => `${table}:${JSON.stringify(row)}`);
  });
  return createHash('sha256').update(rows.sort().join('\n')).digest('hex');
}

function journeyFacts(database) {
  if (!tableExists(database, 'nodes')) return {};
  const statement = database.prepare(`SELECT id,
      CASE
        WHEN id GLOB 'multi-device-sync-a-*' OR title GLOB 'Multi-device sync A fact*'
          OR title GLOB 'T121 A fact *' THEN 'A'
        WHEN id GLOB 'multi-device-sync-b-*' OR title GLOB 'Multi-device sync B fact*'
          OR title GLOB 'T121 B fact *' THEN 'B'
        WHEN id GLOB 'multi-device-sync-c-*' OR title GLOB 'Multi-device sync C fact*'
          OR title GLOB 'T121 C fact *' THEN 'C'
      END AS origin
    FROM nodes WHERE deleted_at IS NULL AND (
      id GLOB 'multi-device-sync-[abc]-*' OR title GLOB 'Multi-device sync [ABC] fact*'
      OR title GLOB 'T121 [ABC] fact *')
    ORDER BY updated_at DESC`);
  if (typeof statement.all !== 'function') return {};
  const rows = statement.all();
  return Object.fromEntries(rows.map(({ id, origin }) => [id, origin]));
}

export function identityFingerprint(value) {
  return authorizationFingerprint(value);
}

export function inspectPairSyncRecoveryWorkspace(database) {
  const deviceId = meta(database, 'device_id');
  const latestSyncRun = latestFinishedSyncEvent(database);
  const rejection = pairingCredentialRejection(latestSyncRun);
  const group = inspectSyncGroupBinding(database, deviceId);
  const storedGroup = inspectStoredSyncGroup(database);
  return {
    activeSyncGroupMemberCount: count(database, 'sync_group_members', " WHERE state = 'active'"),
    deviceIdentityFingerprint: identityFingerprint(deviceId),
    deviceProfile: deviceId,
    dirtyRecordCount: count(
      database,
      'sync_object_state',
      " WHERE sync_dirty = 1 AND object_type <> 'view_state'"
    ),
    dirtyObjectCounts: dirtyObjectCounts(database),
    nodeCount: count(database, 'nodes'),
    latestSyncRunResult: typeof latestSyncRun?.result === 'string'
      ? latestSyncRun.result : null,
    latestSyncFailureKind: classifySyncFailure(latestSyncRun),
    latestSyncFailureRoute: classifySyncFailureRoute(latestSyncRun),
    latestSyncFailureStage: classifySyncFailureStage(latestSyncRun),
    latestSyncRunStatus: typeof latestSyncRun?.status === 'string'
      ? latestSyncRun.status : null,
    latestSyncWaitingConfirmationCount: waitingCount(
      latestSyncRun, 'waiting_confirmation_count'
    ),
    latestSyncWaitingSendCount: waitingCount(latestSyncRun, 'waiting_send_count'),
    journeyFacts: journeyFacts(database),
    localMemberAuthorizationFingerprint:
      inspectLocalActiveMemberAuthorizationFingerprint(database),
    missingAttachmentCount: tableExists(database, 'attachment_blobs')
      ? scalar(database, `SELECT COUNT(*) AS count FROM attachment_blobs
        WHERE availability NOT IN ('cached', 'local')`) : null,
    missingContentBlobCount: tableExists(database, 'content_blobs')
      && tableExists(database, 'content_blob_data')
      ? scalar(database, `SELECT COUNT(*) AS count FROM content_blobs cb
        LEFT JOIN content_blob_data cbd ON cbd.hash = cb.hash WHERE cbd.hash IS NULL`) : null,
    pairingCredentialRejectionReason: rejection.reason,
    pairingCredentialsRejected: rejection.rejected,
    currentDeliveryStatusCountsByPeerFingerprint:
      currentDeliveryStatusCountsByPeerFingerprint(database),
    pendingDeliveryCountsByPeerFingerprint: pendingDeliveryCountsByPeerFingerprint(database),
    protectedContentDigest: protectedContentDigest(database),
    storedSyncGroupId: storedGroup?.group_id ?? null,
    storedSyncGroupTimelineId: storedGroup?.timeline_id ?? null,
    syncGroupId: group?.group_id ?? null,
    syncGroupTimelineId: group?.timeline_id ?? null,
    workgroupKeyPresent: inspectWorkgroupKeyPresent(database),
    userNodeCount: count(database, 'nodes',
      " WHERE id NOT IN ('special-inbox', 'special-virtual-root')")
  };
}

export function pairSyncRecoveryReadiness(
  snapshot, pairingCredentialsPresent, remotePeerFingerprint = null, pairingPeerConflict = false,
  storedDeviceFingerprint = null, databaseWorkgroupKeyPresent = false
) {
  const inspection = snapshot.database?.inspection;
  const databaseAvailabilityReason = inspection ? null
    : snapshot.packageInfo?.installed && snapshot.packageInfo.debuggable === false
      ? 'installed_app_not_debuggable'
      : snapshot.database?.unreadable
        ? snapshot.database.errorCode ?? 'database_snapshot_unreadable'
        : 'database_missing_or_inaccessible';
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
  const groupAuthorityPresent = databaseWorkgroupKeyPresent || pairingCredentialsPresent;
  if (inspection && (inspection.nodeCount ?? 0) > 1 && !groupAuthorityPresent) {
    missingPrerequisites.push('nonempty_workspace_requires_review');
  }
  if (inspection && (inspection.dirtyRecordCount ?? 0) > 0) {
    missingPrerequisites.push('unsynced_device_data_requires_review');
  }
  if (!databaseWorkgroupKeyPresent && pairingPeerConflict) {
    missingPrerequisites.push('existing_pairing_peer_conflict');
  } else if (pairingCredentialsPresent && !remotePeerFingerprint) {
    missingPrerequisites.push('existing_pairing_peer_unproven');
  }
  return {
    activeSyncGroupMemberCount: inspection?.activeSyncGroupMemberCount ?? null,
    currentDeliveryStatusCountsByPeerFingerprint:
      inspection?.currentDeliveryStatusCountsByPeerFingerprint ?? {},
    databaseAvailabilityDetail: inspection ? null : snapshot.database?.error ?? null,
    databaseAvailabilityReason,
    deviceIdentityFingerprint: inspection?.deviceIdentityFingerprint ?? null,
    dirtyRecordCount: inspection?.dirtyRecordCount ?? null,
    dirtyObjectCounts: inspection?.dirtyObjectCounts ?? {},
    missingPrerequisites,
    nodeCount: inspection?.nodeCount ?? null,
    latestSyncRunResult: inspection?.latestSyncRunResult ?? null,
    latestSyncFailureKind: inspection?.latestSyncFailureKind ?? null,
    latestSyncFailureRoute: inspection?.latestSyncFailureRoute ?? null,
    latestSyncFailureStage: inspection?.latestSyncFailureStage ?? null,
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
    storedSyncGroupId: inspection?.storedSyncGroupId ?? null,
    storedSyncGroupTimelineId: inspection?.storedSyncGroupTimelineId ?? null,
    syncGroupId: inspection?.syncGroupId ?? null,
    syncGroupTimelineId: inspection?.syncGroupTimelineId ?? null,
    workgroupKeyPresent: databaseWorkgroupKeyPresent,
    resultStatus: missingPrerequisites.length === 0 ? 'ready' : 'approval_required',
    schemaVersion: 1
  };
}
