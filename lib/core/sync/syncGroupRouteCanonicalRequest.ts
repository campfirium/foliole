import {
  SYNC_GROUP_ROUTE_HMAC_VERSION,
  type SyncGroupRouteCanonicalRequest,
  type SyncGroupSecureRouteMetadata
} from '../../platform/syncGroupAuthorizationContract.js';

export function createSyncGroupRouteCanonicalRequest(
  route: SyncGroupSecureRouteMetadata,
  request: Pick<SyncGroupRouteCanonicalRequest,
    'body_hash' | 'method' | 'nonce' | 'path_with_query' | 'timestamp'>
) {
  return [
    SYNC_GROUP_ROUTE_HMAC_VERSION,
    request.method.trim().toUpperCase(),
    request.path_with_query,
    request.timestamp,
    request.nonce,
    request.body_hash,
    route.group_id,
    route.local_member_id,
    route.peer_member_id,
    String(route.authorization_epoch),
    route.route_id
  ].join('\n');
}
