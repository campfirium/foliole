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

export function identityFingerprint(value) {
  return value ? createHash('sha256').update(value).digest('hex').slice(0, 16) : null;
}

export function inspectPairSyncRecoveryWorkspace(database) {
  const deviceId = meta(database, 'device_id');
  return {
    deviceIdentityFingerprint: identityFingerprint(deviceId),
    dirtyRecordCount: count(database, 'sync_object_state', ' WHERE sync_dirty = 1'),
    nodeCount: count(database, 'nodes')
  };
}

export function pairSyncRecoveryReadiness(
  snapshot, pairingCredentialsPresent, remotePeerFingerprint = null, pairingPeerConflict = false
) {
  const inspection = snapshot.database?.inspection;
  const missingPrerequisites = [];
  if (!snapshot.packageInfo?.installed) missingPrerequisites.push('app_missing');
  if (!snapshot.database?.exists || snapshot.database.unreadable || !inspection) {
    missingPrerequisites.push('database_unavailable');
  }
  if (inspection && !inspection.deviceIdentityFingerprint) {
    missingPrerequisites.push('device_identity_missing');
  }
  if (inspection && (inspection.nodeCount ?? 0) > 1) {
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
    deviceIdentityFingerprint: inspection?.deviceIdentityFingerprint ?? null,
    dirtyRecordCount: inspection?.dirtyRecordCount ?? null,
    missingPrerequisites,
    nodeCount: inspection?.nodeCount ?? null,
    pairingCredentialsPresent,
    pairingPeerConflict,
    remotePeerFingerprint,
    resultStatus: missingPrerequisites.length === 0 ? 'ready' : 'approval_required',
    schemaVersion: 1
  };
}
