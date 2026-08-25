import {
  SYNC_GROUP_AUTHORIZATION_PREPARE_TOKEN,
  type SyncGroupSecureRouteMetadata
} from '../../../../../lib/platform/syncGroupAuthorizationContract';
import { FolioleCompanionSync } from '../../companionWorkspaceRuntimeRepository';

const token = { prepare_token: SYNC_GROUP_AUTHORIZATION_PREPARE_TOKEN };

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
