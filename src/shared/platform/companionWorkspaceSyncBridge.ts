import { Capacitor, registerPlugin } from '@capacitor/core';

import type {
  CompanionWorkspaceDiscoveryPayload,
  CompanionWorkspacePairPayload,
  CompanionWorkspacePairRequestPayload,
  NativeCompanionDirtyNodePayload,
  NativeCompanionPairingState,
  NativeCompanionReadableArticlePayload,
  NativeCompanionSignedRequestHeaders,
  NativeCompanionWorkspaceSyncState
} from '../../../lib/platform/nativeCompanionSyncContract';

export const DISCOVERY_ENDPOINT_PATH = '/companion/discovery';
export const PAIR_ENDPOINT_PATH = '/companion/pair';
export const PAIR_REQUESTS_ENDPOINT_PATH = '/companion/pair-requests';
export const WORKSPACE_SNAPSHOT_PATH = '/companion/workspace-snapshot';
export const WORKSPACE_VERSION_PATH = '/companion/workspace-version';

export interface CompanionWorkspaceSyncPlugin {
  loadPairingState(): Promise<NativeCompanionPairingState>;
  loadDirtyNodes(): Promise<NativeCompanionDirtyNodePayload>;
  loadWorkspaceSyncState(): Promise<NativeCompanionWorkspaceSyncState>;
  loadReadableArticle(): Promise<NativeCompanionReadableArticlePayload>;
  removeWorkspaceSyncRememberedTarget(args: { endpoint_url: string }): Promise<NativeCompanionWorkspaceSyncState>;
  savePairingCredentials(args: {
    device_id: string;
    device_kind: string;
    device_name: string;
    device_secret: string;
    paired_at: string;
  }): Promise<NativeCompanionPairingState>;
  saveWorkspaceSyncEndpoint(args: { endpoint_url: string | null }): Promise<NativeCompanionWorkspaceSyncState>;
  signCompanionSyncRequest(args: {
    body_hash: string;
    method: string;
    nonce: string;
    path_with_query: string;
    timestamp: string;
  }): Promise<NativeCompanionSignedRequestHeaders>;
  replaceWorkspaceSnapshot(args: {
    endpoint_url: string;
    last_synced_at: string;
    workspace_snapshot_json: string;
  }): Promise<NativeCompanionWorkspaceSyncState>;
  replaceWorkspaceNode(args: {
    endpoint_url: string;
    last_synced_at: string;
    node_id: string;
    node_snapshot_json: string;
  }): Promise<NativeCompanionWorkspaceSyncState>;
}

export const FolioleCompanionSync = registerPlugin<CompanionWorkspaceSyncPlugin>('FolioleCompanionSync');

export function isNativeAndroidCompanionRuntime() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
}

export function normalizeEndpointUrl(endpointUrl: string) {
  return endpointUrl.trim().replace(/\/+$/, '');
}

export type PairCompanionWithDesktopArgs = {
  deviceKind: string;
  deviceName: string;
  endpointUrl: string;
  pairRequestId: string;
};

export type RequestCompanionPairingArgs = {
  deviceId: string;
  deviceKind: string;
  deviceName: string;
  endpointUrl: string;
};

export type PairCompanionWithDesktopResponse = CompanionWorkspacePairPayload;
export type RequestCompanionPairingResponse = CompanionWorkspacePairRequestPayload;
export type LoadCompanionDiscoveryResponse = CompanionWorkspaceDiscoveryPayload;
