import { registerPlugin } from '@capacitor/core';

import type {
  CompanionWorkspaceDiscoveryPayload,
  CompanionWorkspacePairPayload,
  CompanionWorkspacePairRequestPayload
} from '../../../lib/platform/nativeCompanionSyncContract';

import { getCompanionRuntimeCapability, requireAvailableCompanionRuntime } from './companionRuntimeCapabilities';
import type { CompanionWorkspaceSyncPlugin } from './companionWorkspaceSyncPluginTypes';

export const DISCOVERY_ENDPOINT_PATH = '/companion/discovery';
export const PAIR_ENDPOINT_PATH = '/companion/pair';
export const PAIR_REQUESTS_ENDPOINT_PATH = '/companion/pair-requests';
export const WORKSPACE_VERSION_PATH = '/companion/workspace-version';

export const FolioleCompanionSync = registerPlugin<CompanionWorkspaceSyncPlugin>('FolioleCompanionSync');

export function isNativeAndroidCompanionRuntime() {
  return requireAvailableCompanionRuntime('native-runtime').kind === 'android-native';
}

export function isAvailableNativeAndroidCompanionRuntime() {
  return getCompanionRuntimeCapability().kind === 'android-native';
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
