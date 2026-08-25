import type { SyncGroupSecureRouteMetadata } from '../../lib/platform/syncGroupAuthorizationContract';
import { CURRENT_SYNC_PROTOCOL_DESCRIPTOR } from '../../lib/platform/syncProtocolContract';
import {
  loadPreparedSyncGroupMemberRoute,
  migratePreparedLegacyPairingRoute,
  revokePreparedSyncGroupMemberRoute,
  signPreparedSyncGroupMemberRequest
} from '../shared/platform/companion/sync/companionSyncGroupAuthorizationPrepare';
import { loadCompanionPairingState } from '../shared/platform/companionWorkspacePairing';
import { FolioleCompanionSync } from '../shared/platform/companionWorkspaceRuntimeRepository';

import { postResult } from './iosBridgeAcceptance';

const ROUTE: Omit<SyncGroupSecureRouteMetadata, 'kind' | 'state'> = {
  authorization_epoch: 2,
  authorization_id: 'authorization-ios-acceptance',
  endpoint_hint: 'http://127.0.0.1:38641',
  group_id: 'group-authorization-acceptance',
  local_member_id: 'member-ios-acceptance',
  peer_member_id: 'member-manager-acceptance',
  protocol_version: 4,
  route_id: 'route-ios-to-manager'
};
const REQUEST = {
  body_hash: 'ios-authorization-body-hash', method: 'POST', nonce: 'ios-authorization-nonce',
  path_with_query: '/acceptance/member-route', route_id: ROUTE.route_id,
  timestamp: '2026-08-26T00:00:00.000Z'
};

export async function runIosSyncGroupAuthorizationAcceptance() {
  try {
    const current = await loadPreparedSyncGroupMemberRoute(ROUTE.route_id);
    if (current.route) await runRestartLeg();
    else await runMigrationLeg();
  } catch (error) {
    postResult({
      error: error instanceof Error ? error.message : String(error),
      phase: 'failed', scenario: 'sync-group-authorization', status: 'failed'
    });
  }
}

async function runMigrationLeg() {
  await FolioleCompanionSync.clearPairingCredentials();
  await FolioleCompanionSync.savePairingCredentials({
    authorization_id: ROUTE.authorization_id,
    credential_secret: 'dDE1MTItaW9zLXJvdXRlLXNlY3JldA',
    ...(ROUTE.endpoint_hint ? { endpoint_url: ROUTE.endpoint_hint } : {}),
    host_name: 'Acceptance iPhone',
    host_platform: 'ios',
    negotiated_protocol_version: CURRENT_SYNC_PROTOCOL_DESCRIPTOR.version,
    paired_at: '2026-08-26T00:00:00.000Z',
    remote_peer_id: ROUTE.peer_member_id,
    remote_peer_name: 'Acceptance manager',
    remote_peer_platform: 'darwin',
    remote_protocol: CURRENT_SYNC_PROTOCOL_DESCRIPTOR,
    sync_group_id: ROUTE.group_id
  });
  const migrated = await migratePreparedLegacyPairingRoute(ROUTE);
  const signed = await signPreparedSyncGroupMemberRequest(REQUEST);
  postResult({
    error: null, legacy_pairing_preserved: (await loadCompanionPairingState()).is_paired,
    phase: 'route-saved', route: migrated.route, scenario: 'sync-group-authorization',
    signature: signed.headers['X-Signature'], status: 'passed'
  });
}

async function runRestartLeg() {
  const signed = await signPreparedSyncGroupMemberRequest(REQUEST);
  const revoked = await revokePreparedSyncGroupMemberRoute(ROUTE.route_id);
  let signingRejected = false;
  try { await signPreparedSyncGroupMemberRequest(REQUEST); } catch { signingRejected = true; }
  const after = await loadPreparedSyncGroupMemberRoute(ROUTE.route_id);
  postResult({
    error: null, legacy_pairing_preserved: (await loadCompanionPairingState()).is_paired,
    phase: 'route-restarted', revoked: revoked.revoked, route_removed: after.route === null,
    scenario: 'sync-group-authorization', signature: signed.headers['X-Signature'],
    signing_rejected_after_revoke: signingRejected, status: 'passed'
  });
}
