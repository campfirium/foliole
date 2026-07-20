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

export function isNativeCompanionPairingRuntime() {
  const runtime = requireAvailableCompanionRuntime('pairing-runtime');
  return runtime.kind === 'android-native' || runtime.kind === 'ios-native';
}

export function isNativeCompanionContentBlobRuntime() {
  const runtime = requireAvailableCompanionRuntime('content-blob-sync');
  return runtime.kind === 'android-native' || runtime.kind === 'ios-native';
}

export function isNativeCompanionAttachmentResourceRuntime() {
  const runtime = requireAvailableCompanionRuntime('attachment-resource-sync');
  return runtime.kind === 'android-native' || runtime.kind === 'ios-native';
}

export function isNativeCompanionTopicSearchRuntime() {
  const runtime = requireAvailableCompanionRuntime('topic-search');
  return runtime.kind === 'android-native' || runtime.kind === 'ios-native';
}

export function isNativeCompanionPdfPageTextRuntime() {
  const runtime = requireAvailableCompanionRuntime('pdf-page-text');
  return runtime.kind === 'android-native' || runtime.kind === 'ios-native';
}

export function isNativeCompanionExternalDocumentSearchRuntime() {
  const runtime = requireAvailableCompanionRuntime('external-document-search');
  return runtime.kind === 'android-native' || runtime.kind === 'ios-native';
}

export function isNativeCompanionExternalDocumentReadRuntime() {
  const runtime = requireAvailableCompanionRuntime('external-document-read');
  return runtime.kind === 'android-native' || runtime.kind === 'ios-native';
}

export function isNativeCompanionExternalDirectoryRuntime() {
  const runtime = requireAvailableCompanionRuntime('external-document-directory');
  return runtime.kind === 'android-native' || runtime.kind === 'ios-native';
}

export function isNativeCompanionSyncObjectReadRuntime() {
  const runtime = requireAvailableCompanionRuntime('sync-object-read');
  return runtime.kind === 'android-native' || runtime.kind === 'ios-native';
}

export function isNativeCompanionSyncDiagnosticsRuntime() {
  const runtime = requireAvailableCompanionRuntime('sync-diagnostics');
  return runtime.kind === 'android-native' || runtime.kind === 'ios-native';
}

export function isNativeCompanionViewStateWriteRuntime() {
  const runtime = requireAvailableCompanionRuntime('view-state-write');
  return runtime.kind === 'android-native' || runtime.kind === 'ios-native';
}

export function isNativeCompanionReadingWriteRuntime() {
  const runtime = requireAvailableCompanionRuntime('reading-write');
  return runtime.kind === 'android-native' || runtime.kind === 'ios-native';
}

export function isNativeCompanionReviewWriteRuntime() {
  const runtime = requireAvailableCompanionRuntime('review-write');
  return runtime.kind === 'android-native' || runtime.kind === 'ios-native';
}

export function getNativeCompanionReviewSyncbackPlatform() {
  const runtime = requireAvailableCompanionRuntime('review-syncback');
  return runtime.kind === 'android-native' || runtime.kind === 'ios-native'
    ? runtime.platform
    : null;
}

export function getNativeCompanionSettingWritePlatform() {
  const runtime = requireAvailableCompanionRuntime('setting-write');
  return runtime.kind === 'android-native' || runtime.kind === 'ios-native'
    ? runtime.platform
    : null;
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
