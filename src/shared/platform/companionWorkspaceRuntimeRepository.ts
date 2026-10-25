import { registerPlugin } from '@capacitor/core';

import type { CompanionWorkspaceDiscoveryPayload } from '../../../lib/platform/nativeCompanionSyncContract';
import type { SyncTriggerReason } from '../../../lib/platform/syncTriggerContract';

import {
  getCompanionRuntimeCapability,
  hasCompanionLocalDatabase,
  isCompanionRuntimeCapabilityAvailable,
  requireAvailableCompanionRuntime,
  requireCompanionNativePlugin
} from './companionRuntimeCapabilities';
import type { CompanionWorkspaceSyncPlugin } from './companionWorkspaceSyncPluginTypes';

export const DISCOVERY_ENDPOINT_PATH = '/companion/discovery';
export const WORKSPACE_VERSION_PATH = '/companion/workspace-version';

export const FolioleCompanionSync = registerPlugin<CompanionWorkspaceSyncPlugin>('FolioleCompanionSync');

export function beginNativeCompanionSyncRun(reason: SyncTriggerReason, runId: string) {
  requireCompanionNativePlugin('sync-trigger', 'FolioleCompanionSync');
  return FolioleCompanionSync.beginSyncRun({ reason, run_id: runId });
}

export function isNativeAndroidCompanionRuntime() {
  return requireAvailableCompanionRuntime('native-runtime').kind === 'android-native';
}

export function isNativeCompanionNetworkRuntime() {
  const runtime = requireAvailableCompanionRuntime('sync-group-provider');
  return runtime.kind === 'android-native' || runtime.kind === 'ios-native';
}

export function isNativeCompanionAttachmentResourceRuntime() {
  const runtime = requireAvailableCompanionRuntime('attachment-resource-sync');
  return runtime.kind === 'android-native' || runtime.kind === 'ios-native';
}

export function isNativeCompanionTopicSearchRuntime() {
  const runtime = requireAvailableCompanionRuntime('topic-search');
  return hasCompanionLocalDatabase(runtime);
}

export function isNativeCompanionPdfPageTextRuntime() {
  const runtime = requireAvailableCompanionRuntime('pdf-page-text');
  return hasCompanionLocalDatabase(runtime);
}

export function isNativeCompanionExternalDocumentSearchRuntime() {
  const runtime = requireAvailableCompanionRuntime('external-document-search');
  return hasCompanionLocalDatabase(runtime);
}

export function isNativeCompanionExternalDocumentReadRuntime() {
  const runtime = requireAvailableCompanionRuntime('external-document-read');
  return hasCompanionLocalDatabase(runtime);
}

export function isNativeCompanionExternalDirectoryRuntime() {
  const runtime = requireAvailableCompanionRuntime('external-document-directory');
  return runtime.kind === 'android-native' || runtime.kind === 'ios-native';
}

export function isNativeCompanionSyncObjectReadRuntime() {
  const runtime = requireAvailableCompanionRuntime('sync-object-read');
  return hasCompanionLocalDatabase(runtime);
}

export function isNativeCompanionSyncDiagnosticsRuntime() {
  const runtime = requireAvailableCompanionRuntime('sync-diagnostics');
  return hasCompanionLocalDatabase(runtime);
}

export function isNativeCompanionViewStateWriteRuntime() {
  const runtime = requireAvailableCompanionRuntime('view-state-write');
  return hasCompanionLocalDatabase(runtime);
}

export function isNativeCompanionReadingWriteRuntime() {
  const runtime = requireAvailableCompanionRuntime('reading-write');
  return hasCompanionLocalDatabase(runtime);
}

export function isNativeCompanionOpenStateWriteRuntime() {
  const runtime = requireAvailableCompanionRuntime('open-state-write');
  return hasCompanionLocalDatabase(runtime);
}

export function isNativeCompanionReviewWriteRuntime() {
  const runtime = requireAvailableCompanionRuntime('review-write');
  return hasCompanionLocalDatabase(runtime);
}

export function isNativeCompanionNodeVersionWriteRuntime() {
  const runtime = requireAvailableCompanionRuntime('node-version-write');
  return hasCompanionLocalDatabase(runtime);
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

export function isNativeCompanionSyncGroupRuntime() {
  const runtime = getCompanionRuntimeCapability();
  if (!isCompanionRuntimeCapabilityAvailable('sync-group-provider')) return false;
  return runtime.kind === 'android-native' || runtime.kind === 'ios-native';
}

export function isNativeCompanionSyncGroupStoreRuntime() {
  const runtime = requireAvailableCompanionRuntime('sync-group-store');
  return hasCompanionLocalDatabase(runtime);
}

export function isNativeCompanionSyncParticipationRuntime() {
  const runtime = requireAvailableCompanionRuntime('sync-participation');
  return hasCompanionLocalDatabase(runtime);
}

export function isAvailableNativeCompanionRuntime() {
  return hasCompanionLocalDatabase(getCompanionRuntimeCapability());
}

export type CompanionNodeMutationSurface =
  | 'existing-highlight-edit'
  | 'quick-capture'
  | 'selection-annotation'
  | 'topic-content-edit'
  | 'trash-restore'
  | 'workspace-structure';

const IOS_NODE_MUTATION_SURFACES = new Set<CompanionNodeMutationSurface>([
  'existing-highlight-edit',
  'quick-capture',
  'selection-annotation',
  'topic-content-edit',
  'trash-restore',
  'workspace-structure'
]);

export function supportsCompanionNodeMutationSurface(surface: CompanionNodeMutationSurface) {
  const runtime = getCompanionRuntimeCapability();
  if (runtime.kind === 'ios-native') return IOS_NODE_MUTATION_SURFACES.has(surface);
  return runtime.kind === 'android-native' || runtime.kind === 'browser-preview' || runtime.kind === 'web-preview';
}

export function normalizeEndpointUrl(endpointUrl: string) {
  return endpointUrl.trim().replace(/\/+$/, '');
}

export type LoadCompanionDiscoveryResponse = CompanionWorkspaceDiscoveryPayload;
