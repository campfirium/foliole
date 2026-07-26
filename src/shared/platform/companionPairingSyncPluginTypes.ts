import type {
  NativeCompanionPairingState,
  NativeCompanionSignedRequestHeaders
} from '../../../lib/platform/nativeCompanionSyncContract';

export interface CompanionPairingSyncPlugin {
  clearPairingCredentials(): Promise<NativeCompanionPairingState>;
  loadPairingState(): Promise<NativeCompanionPairingState>;
  savePairingCredentials(args: {
    device_id: string;
    device_kind: string;
    device_name: string;
    device_secret: string;
    negotiated_protocol_version: number;
    paired_at: string;
    primary_device_id: string;
    remote_peer_id?: string | null;
    remote_peer_name?: string | null;
    remote_peer_platform?: string | null;
    remote_protocol: NonNullable<NativeCompanionPairingState['remote_protocol']>;
  }): Promise<NativeCompanionPairingState>;
  savePrimaryDeviceId(args: { primary_device_id: string }): Promise<NativeCompanionPairingState>;
  signCompanionSyncRequest(args: {
    body_hash: string;
    method: string;
    nonce: string;
    path_with_query: string;
    timestamp: string;
  }): Promise<NativeCompanionSignedRequestHeaders>;
}
