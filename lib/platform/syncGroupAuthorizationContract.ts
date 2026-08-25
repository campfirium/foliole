export const SYNC_GROUP_ROUTE_HMAC_VERSION = 'foliole-sync-group-route-hmac-v1';
export const SYNC_GROUP_AUTHORIZATION_PREPARE_TOKEN = 't151-prepare-authorization-v1';

export type SyncGroupSecureRouteKind = 'member' | 'verification';

export interface SyncGroupSecureRouteMetadata {
  authorization_epoch: number;
  authorization_id: string;
  endpoint_hint: string | null;
  group_id: string;
  kind: SyncGroupSecureRouteKind;
  local_member_id: string;
  peer_member_id: string;
  protocol_version: 4;
  route_id: string;
  state: 'active';
}

export interface SyncGroupRouteCanonicalRequest {
  authorization_epoch: number;
  body_hash: string;
  group_id: string;
  local_member_id: string;
  method: string;
  nonce: string;
  path_with_query: string;
  peer_member_id: string;
  route_id: string;
  timestamp: string;
}

export interface SyncGroupRouteSignedHeaders {
  'X-Authorization-Epoch': string;
  'X-Authorization-Id': string;
  'X-Local-Member-Id': string;
  'X-Nonce': string;
  'X-Peer-Member-Id': string;
  'X-Route-Id': string;
  'X-Signature': string;
  'X-Sync-Group-Id': string;
  'X-Timestamp': string;
}

export function isSyncGroupSecureRouteMetadata(value: unknown): value is SyncGroupSecureRouteMetadata {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  const strings = ['authorization_id', 'group_id', 'local_member_id', 'peer_member_id', 'route_id'];
  return strings.every((key) => typeof record[key] === 'string' && Boolean((record[key] as string).trim())) &&
    Number.isInteger(record.authorization_epoch) && Number(record.authorization_epoch) > 0 &&
    (record.endpoint_hint === null || typeof record.endpoint_hint === 'string') &&
    (record.kind === 'member' || record.kind === 'verification') &&
    record.protocol_version === 4 && record.state === 'active';
}
