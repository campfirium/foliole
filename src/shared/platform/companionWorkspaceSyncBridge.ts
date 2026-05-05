import { Capacitor, registerPlugin } from '@capacitor/core';

import type {
  CompanionWorkspaceDiscoveryPayload,
  CompanionWorkspacePairPayload,
  CompanionWorkspacePairRequestPayload,
  NativeCompanionPairingState,
  NativeCompanionReadableArticlePayload,
  NativeCompanionSignedRequestHeaders,
  NativeCompanionWorkspaceSyncState
} from '../../../lib/platform/nativeCompanionSyncContract';
import type {
  NativeSyncChangeCursor,
  NativeSyncIndexEntry,
  NativeSyncNodeConflictRecord,
  NativeSyncNodeRecord,
  NativeSyncObjectRecord,
  NativeSyncPackApplyResult,
  NativeSyncReviewLogRecord,
  NativeSyncStateObjectRecord
} from '../../../lib/platform/nativeSyncContract';

export const DISCOVERY_ENDPOINT_PATH = '/companion/discovery';
export const PAIR_ENDPOINT_PATH = '/companion/pair';
export const PAIR_REQUESTS_ENDPOINT_PATH = '/companion/pair-requests';
export const WORKSPACE_VERSION_PATH = '/companion/workspace-version';

export interface CompanionDiscoveryCandidatesPayload {
  endpoint_urls: string[];
}

export interface CompanionWorkspaceSyncPlugin {
  applySyncObjects(args: { objects: NativeSyncObjectRecord[] }): Promise<{ applied_object_ids: string[] }>;
  applyDesktopSyncPack(args: {
    headers: Record<string, string>;
    url: string;
  }): Promise<NativeSyncPackApplyResult>;
  applySyncPack(args: { pack_path: string }): Promise<NativeSyncPackApplyResult>;
  applySyncNodeVersions(args: { nodes: NativeSyncNodeRecord[] }): Promise<{ applied_node_ids: string[] }>;
  applySyncReviewLog(args: { reviews: NativeSyncReviewLogRecord[] }): Promise<{ applied_op_ids: string[] }>;
  desktopHttpRequest(args: {
    body?: string;
    headers?: Record<string, string>;
    method: string;
    url: string;
  }): Promise<{ body: string; status: number }>;
  loadSyncIndex(): Promise<{ entries: NativeSyncIndexEntry[] }>;
  loadSyncNodeConflicts(): Promise<{ conflicts: NativeSyncNodeConflictRecord[] }>;
  loadSyncObjects(args: {
    object_ids: string[];
    object_types?: Array<NativeSyncObjectRecord['object_type']>;
  }): Promise<{ objects: NativeSyncObjectRecord[] }>;
  loadSyncStateChanges(args: {
    cursor: number | null;
    limit?: number;
  }): Promise<{ objects: NativeSyncStateObjectRecord[] }>;
  loadMissingContentBlobHashes(args: {
    limit?: number;
  }): Promise<{ hashes: string[] }>;
  loadSyncStateCursor(): Promise<{ cursor: number | null }>;
  loadSyncPackCursor(): Promise<{ cursor: number | null }>;
  loadSyncStatePushCursor(): Promise<{ cursor: number | null }>;
  loadSyncNodeVersionCursor(): Promise<{ cursor: NativeSyncChangeCursor | null }>;
  loadSyncNodeVersionPushCursor(): Promise<{ cursor: NativeSyncChangeCursor | null }>;
  loadSyncNodeVersions(args: {
    cursor: NativeSyncChangeCursor | null;
    limit?: number;
  }): Promise<{ nodes: NativeSyncNodeRecord[] }>;
  loadSyncReviewLogCursor(): Promise<{ cursor: NativeSyncChangeCursor | null }>;
  loadSyncReviewLogPushCursor(): Promise<{ cursor: NativeSyncChangeCursor | null }>;
  loadSyncReviewLog(args: {
    cursor: NativeSyncChangeCursor | null;
    limit?: number;
  }): Promise<{ reviews: NativeSyncReviewLogRecord[] }>;
  loadPairingState(): Promise<NativeCompanionPairingState>;
  loadDiscoveryCandidates(): Promise<CompanionDiscoveryCandidatesPayload>;
  loadWorkspaceSyncState(): Promise<NativeCompanionWorkspaceSyncState>;
  loadReadableArticle(): Promise<NativeCompanionReadableArticlePayload>;
  loadPdfPageText(args: {
    attachment_id: string;
  }): Promise<{
    attachment_id: string;
    pages: Array<{
      page: number;
      page_height: number | null;
      page_width: number | null;
      text: string;
    }>;
  }>;
  searchPdfPageText(args: {
    limit?: number;
    query: string;
  }): Promise<{
    query: string;
    results: Array<{
      attachment_id: string;
      excerpt: string;
      match_start: number;
      page: number;
      page_height: number | null;
      page_width: number | null;
      text: string;
    }>;
  }>;
  loadExternalDocument(args: {
    document_id: string;
  }): Promise<{
    document: {
      content: string;
      content_status?: 'missing' | 'ready';
      document_id: string;
      extension: string;
      file_name: string;
      folder_id: string;
      opening_text: string | null;
      relative_path: string;
      title: string;
      updated_at: string;
    } | null;
  }>;
  searchExternalDocuments(args: {
    limit?: number;
    query: string;
  }): Promise<{
    query: string;
    results: Array<{
      content: string;
      content_status?: 'missing' | 'ready';
      document_id: string;
      excerpt: string;
      extension: string;
      file_name: string;
      folder_id: string;
      match_start: number;
      opening_text: string | null;
      relative_path: string;
      title: string;
      updated_at: string;
    }>;
  }>;
  removeWorkspaceSyncRememberedTarget(args: { endpoint_url: string }): Promise<NativeCompanionWorkspaceSyncState>;
  recordWorkspaceSyncEvent(args: {
    endpoint_url: string | null;
    message: string;
    occurred_at: string;
    status: 'completed' | 'failed' | 'skipped' | 'started';
  }): Promise<NativeCompanionWorkspaceSyncState>;
  saveSyncOnboardingStatus(args: { status: NativeCompanionWorkspaceSyncState['sync_onboarding_status'] }): Promise<NativeCompanionWorkspaceSyncState>;
  saveSyncStateCursor(args: { cursor: number | null }): Promise<{ cursor: number | null }>;
  saveSyncPackCursor(args: { cursor: number | null }): Promise<{ cursor: number | null }>;
  saveSyncStatePushCursor(args: { cursor: number | null }): Promise<{ cursor: number | null }>;
  saveSyncNodeVersionCursor(args: { cursor: NativeSyncChangeCursor | null }): Promise<{ cursor: NativeSyncChangeCursor | null }>;
  saveSyncNodeVersionPushCursor(args: { cursor: NativeSyncChangeCursor | null }): Promise<{ cursor: NativeSyncChangeCursor | null }>;
  saveSyncReviewLogCursor(args: { cursor: NativeSyncChangeCursor | null }): Promise<{ cursor: NativeSyncChangeCursor | null }>;
  saveSyncReviewLogPushCursor(args: { cursor: NativeSyncChangeCursor | null }): Promise<{ cursor: NativeSyncChangeCursor | null }>;
  saveSyncSettingRecord(args: {
    device_id?: string;
    form_factor?: string;
    key: string;
    platform?: string;
    scope?: string;
    value_json: string;
  }): Promise<{ content_hash: string; object_id: string }>;
  saveSyncNodeReadingRecord(args: {
    node_id: string;
    reading_json: string;
  }): Promise<{ content_hash: string; object_id: string }>;
  saveSyncNodeReviewRecord(args: {
    node_id: string;
    review_log_json?: string;
    review_json: string;
  }): Promise<{ content_hash: string; object_id: string }>;
  saveSyncActiveViewState(args: {
    node_id: string | null;
  }): Promise<{ content_hash: string; object_id: string }>;
  saveSyncNodeViewState(args: {
    node_id: string;
    scroll_top: number;
  }): Promise<{ content_hash: string; object_id: string }>;
  savePairingCredentials(args: {
    device_id: string;
    device_kind: string;
    device_name: string;
    device_secret: string;
    paired_at: string;
  }): Promise<NativeCompanionPairingState>;
  resolveAttachmentResource(args: {
    attachment_id: string;
  }): Promise<{
    mime_type?: string | null;
    resource_url: string | null;
    status: 'missing_file' | 'not_found' | 'ready';
  }>;
  syncAttachmentResource(args: {
    attachment_id: string;
    content_hash: string;
    headers: Record<string, string>;
    url: string;
  }): Promise<{ attachment_id: string; availability: string }>;
  syncContentBlob(args: {
    hash: string;
    headers: Record<string, string>;
    url: string;
  }): Promise<{ availability: string; hash: string }>;
  saveWorkspaceSyncEndpoint(args: { endpoint_url: string | null }): Promise<NativeCompanionWorkspaceSyncState>;
  signCompanionSyncRequest(args: {
    body_hash: string;
    method: string;
    nonce: string;
    path_with_query: string;
    timestamp: string;
  }): Promise<NativeCompanionSignedRequestHeaders>;
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
