import type {
  NativeCompanionPairingState,
  NativeCompanionSignedRequestHeaders
} from '../../../lib/platform/nativeCompanionSyncContract';

export interface CompanionPairingSyncPlugin {
  clearPairingCredentials(): Promise<NativeCompanionPairingState>;
  loadPairingState(): Promise<NativeCompanionPairingState>;
  savePairingCredentials(args: {
    authorization_id: string;
    credential_secret: string;
    device_id: string;
    device_kind: string;
    device_name: string;
    device_secret: string;
    endpoint_url?: string;
    host_name: string;
    host_platform: string;
    negotiated_protocol_version: number;
    paired_at: string;
    provider_device_secret?: string;
    remote_peer_id?: string | null;
    remote_peer_name?: string | null;
    remote_peer_platform?: string | null;
    remote_protocol: NonNullable<NativeCompanionPairingState['remote_protocol']>;
    sync_group_id?: string;
  }): Promise<NativeCompanionPairingState>;
  signCompanionSyncRequest(args: {
    body_hash: string;
    endpoint_url?: string;
    method: string;
    nonce: string;
    path_with_query: string;
    sync_group_id?: string;
    timestamp: string;
    workgroup_key?: string;
  }): Promise<NativeCompanionSignedRequestHeaders>;
}
