import type {
  SyncGroupRouteSignedHeaders,
  SyncGroupSecureRouteMetadata
} from '../../../../../lib/platform/syncGroupAuthorizationContract';

export interface CompanionSyncGroupAuthorizationPlugin {
  consumeSyncGroupRouteGrant(args: {
    authorization_epoch: number;
    authorization_id: string;
    encrypted_route_secret: Record<string, unknown>;
    endpoint_hint?: string | null;
    group_id: string;
    local_member_id: string;
    peer_member_id: string;
    prepare_token: string;
    protocol_version: 4;
    request_id: string;
    route_id: string;
  }): Promise<{ route: SyncGroupSecureRouteMetadata; status: 'consumed' }>;
  createSyncGroupJoinIntentKey(args: {
    prepare_token: string;
    request_id: string;
  }): Promise<{ public_key: string }>;
  discardSyncGroupJoinIntentKey(args: {
    prepare_token: string;
    request_id: string;
  }): Promise<{ discarded: boolean }>;
  loadSyncGroupMemberRoute(args: {
    prepare_token: string;
    route_id: string;
  }): Promise<{ route: SyncGroupSecureRouteMetadata | null }>;
  migrateLegacyPairingToMemberRoute(args: {
    authorization_epoch: number;
    authorization_id: string;
    endpoint_hint?: string | null;
    group_id: string;
    local_member_id: string;
    peer_member_id: string;
    prepare_token: string;
    protocol_version: 4;
    route_id: string;
  }): Promise<{ route: SyncGroupSecureRouteMetadata; status: 'migrated' }>;
  revokeSyncGroupMemberRoute(args: {
    prepare_token: string;
    route_id: string;
  }): Promise<{ revoked: boolean }>;
  signSyncGroupMemberRequest(args: {
    body_hash: string;
    method: string;
    nonce: string;
    path_with_query: string;
    prepare_token: string;
    route_id: string;
    timestamp: string;
  }): Promise<{ headers: SyncGroupRouteSignedHeaders }>;
}
