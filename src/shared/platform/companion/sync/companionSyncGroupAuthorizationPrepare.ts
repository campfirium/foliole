import {
  SYNC_GROUP_AUTHORIZATION_PREPARE_TOKEN,
  type SyncGroupSecureRouteMetadata
} from '../../../../../lib/platform/syncGroupAuthorizationContract';
import { FolioleCompanionSync } from '../../companionWorkspaceRuntimeRepository';

const token = { prepare_token: SYNC_GROUP_AUTHORIZATION_PREPARE_TOKEN };

export function createPreparedSyncGroupJoinIntentKey(requestId: string) {
  return FolioleCompanionSync.createSyncGroupJoinIntentKey({ ...token, request_id: requestId });
}

export function discardPreparedSyncGroupJoinIntentKey(requestId: string) {
  return FolioleCompanionSync.discardSyncGroupJoinIntentKey({ ...token, request_id: requestId });
}

export function consumePreparedSyncGroupRouteGrant(args: {
  authorization_epoch: number;
  authorization_id: string;
  encrypted_route_secret: Record<string, unknown>;
  endpoint_hint?: string | null;
  group_id: string;
  local_member_id: string;
  peer_member_id: string;
  protocol_version: 4;
  request_id: string;
  route_id: string;
}) {
  return FolioleCompanionSync.consumeSyncGroupRouteGrant({ ...token, ...args });
}

export function loadPreparedSyncGroupMemberRoute(routeId: string) {
  return FolioleCompanionSync.loadSyncGroupMemberRoute({ ...token, route_id: routeId });
}

export function migratePreparedLegacyPairingRoute(route: Omit<SyncGroupSecureRouteMetadata, 'kind' | 'state'>) {
  return FolioleCompanionSync.migrateLegacyPairingToMemberRoute({
    ...token,
    authorization_epoch: route.authorization_epoch,
    authorization_id: route.authorization_id,
    endpoint_hint: route.endpoint_hint,
    group_id: route.group_id,
    local_member_id: route.local_member_id,
    peer_member_id: route.peer_member_id,
    protocol_version: route.protocol_version,
    route_id: route.route_id
  });
}

export function revokePreparedSyncGroupMemberRoute(routeId: string) {
  return FolioleCompanionSync.revokeSyncGroupMemberRoute({ ...token, route_id: routeId });
}

export function signPreparedSyncGroupMemberRequest(args: {
  body_hash: string;
  method: string;
  nonce: string;
  path_with_query: string;
  route_id: string;
  timestamp: string;
}) {
  return FolioleCompanionSync.signSyncGroupMemberRequest({ ...token, ...args });
}
