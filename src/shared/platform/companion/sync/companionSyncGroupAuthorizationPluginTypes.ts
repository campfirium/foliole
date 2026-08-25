import type {
  SyncGroupRouteSignedHeaders,
  SyncGroupSecureRouteMetadata
} from '../../../../../lib/platform/syncGroupAuthorizationContract';

export interface CompanionSyncGroupAuthorizationPlugin {
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
