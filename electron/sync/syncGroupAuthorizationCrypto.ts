import { createHmac, timingSafeEqual } from 'node:crypto';

import { createSyncGroupRouteCanonicalRequest } from '../../lib/core/sync/syncGroupRouteCanonicalRequest.js';
import type {
  SyncGroupRouteSignedHeaders,
  SyncGroupSecureRouteMetadata
} from '../../lib/platform/syncGroupAuthorizationContract.js';

export interface RouteRequestFields {
  body_hash: string;
  method: string;
  nonce: string;
  path_with_query: string;
  timestamp: string;
}

export function signSyncGroupRoute(
  route: SyncGroupSecureRouteMetadata,
  secret: string,
  request: RouteRequestFields
): SyncGroupRouteSignedHeaders {
  const signature = routeHmac(route, secret, request);
  return {
    'X-Authorization-Epoch': String(route.authorization_epoch),
    'X-Authorization-Id': route.authorization_id,
    'X-Local-Member-Id': route.local_member_id,
    'X-Nonce': request.nonce,
    'X-Peer-Member-Id': route.peer_member_id,
    'X-Route-Id': route.route_id,
    'X-Signature': signature,
    'X-Sync-Group-Id': route.group_id,
    'X-Timestamp': request.timestamp
  };
}

export function verifySyncGroupRouteSignature(args: {
  request: RouteRequestFields;
  route: SyncGroupSecureRouteMetadata;
  secret: string;
  signature: string;
}) {
  const expected = Buffer.from(routeHmac(args.route, args.secret, args.request), 'hex');
  const actual = Buffer.from(args.signature, 'hex');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function routeHmac(route: SyncGroupSecureRouteMetadata, secret: string, request: RouteRequestFields) {
  return createHmac('sha256', Buffer.from(secret, 'base64url'))
    .update(createSyncGroupRouteCanonicalRequest(route, request))
    .digest('hex');
}
