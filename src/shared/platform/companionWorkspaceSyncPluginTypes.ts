import type {
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
  NativeSyncReviewLogRecord,
  NativeSyncStateObjectRecord
} from '../../../lib/platform/nativeSyncContract';
import type { SyncDiagnosticSnapshot } from '../../../lib/platform/syncDiagnosticsContract';

import type { SyncPushAck } from './companionSyncPushProtocol';

export interface CompanionDiscoveryCandidatesPayload {
  endpoint_urls: string[];
}

export interface CompanionWorkspaceSyncPlugin {
  desktopHttpRequest(args: {
    body?: string;
    headers?: Record<string, string>;
    method: string;
    url: string;
  }): Promise<{ body: string; status: number }>;
  diagnoseSync(): Promise<SyncDiagnosticSnapshot>;
  loadSyncIndex(): Promise<{ entries: NativeSyncIndexEntry[] }>;
  loadSyncNodeConflicts(): Promise<{ conflicts: NativeSyncNodeConflictRecord[] }>;
  loadSyncObjects(args: {
    object_ids: string[];
    object_types?: Array<NativeSyncObjectRecord['object_type']>;
  }): Promise<{ objects: NativeSyncObjectRecord[] }>;
  loadSyncStateChanges(args: { cursor: number | null; limit?: number }): Promise<{ objects: NativeSyncStateObjectRecord[] }>;
  loadMissingContentBlobHashes(args: {
    limit?: number;
  }): Promise<{
    blobs?: Array<{ hash: string; size_bytes?: number }>;
    failed_content_blob_bytes?: number;
    failed_content_blob_count?: number;
    hashes: string[];
    missing_content_blob_bytes?: number;
    missing_content_blob_count?: number;
  }>;
  syncContentBlobs(args: { body: string; headers: Record<string, string>; url: string }): Promise<{
    db_elapsed_ms?: number;
    http_elapsed_ms?: number;
    parse_elapsed_ms?: number;
    synced_hashes: string[];
    total_elapsed_ms?: number;
  }>;
  loadMissingAttachmentResources(args: {
    limit?: number;
  }): Promise<{ resources: Array<{ attachment_id: string; content_hash: string; size_bytes?: number }> }>;
  loadMissingAttachmentResource(args: {
    attachment_id: string;
  }): Promise<{ resource: { attachment_id: string; content_hash: string; size_bytes?: number } | null }>;
  loadSyncStateCursor(): Promise<{ cursor: number | null }>;
  loadSyncPackCursor(): Promise<{ cursor: number | null }>;
  loadSyncStatePushCursor(): Promise<{ cursor: number | null }>;
  loadSyncNodeVersionCursor(): Promise<{ cursor: NativeSyncChangeCursor | null }>;
  loadSyncNodeVersionPushCursor(): Promise<{ cursor: NativeSyncChangeCursor | null }>;
  loadSyncNodeVersions(args: { cursor: NativeSyncChangeCursor | null; limit?: number }): Promise<{ nodes: NativeSyncNodeRecord[] }>;
  loadSyncReviewLogCursor(): Promise<{ cursor: NativeSyncChangeCursor | null }>;
  loadSyncReviewLogPushCursor(): Promise<{ cursor: NativeSyncChangeCursor | null }>;
  loadSyncReviewLog(args: { cursor: NativeSyncChangeCursor | null; limit?: number }): Promise<{ reviews: NativeSyncReviewLogRecord[] }>;
  loadPairingState(): Promise<NativeCompanionPairingState>;
  loadDiscoveryCandidates(): Promise<CompanionDiscoveryCandidatesPayload>;
  loadWorkspaceSyncState(): Promise<NativeCompanionWorkspaceSyncState>;
  loadReadableArticle(): Promise<NativeCompanionReadableArticlePayload>;
  loadPdfPageText(args: { attachment_id: string }): Promise<{
    attachment_id: string;
    pages: Array<{ page: number; page_height: number | null; page_width: number | null; text: string }>;
  }>;
  searchPdfPageText(args: { limit?: number; query: string }): Promise<{
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
  loadExternalDocument(args: { document_id: string }): Promise<{
    document: {
      content: string;
      content_status?: 'failed' | 'fetching' | 'missing' | 'ready';
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
  loadExternalDirectory(): Promise<{
    entries: Array<{
      absolute_path: string;
      document_id: string;
      extension: 'md' | 'txt';
      file_name: string;
      folder_id: string;
      modified_at: string;
      opening_text: string | null;
      relative_path: string;
      title: string;
    }>;
    folders: Array<{ document_count: number; folder_path: string; id: string }>;
  }>;
  searchExternalDocuments(args: { limit?: number; query: string }): Promise<{
    query: string;
    results: Array<{
      content: string;
      content_status?: 'failed' | 'fetching' | 'missing' | 'ready';
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
  saveSyncOnboardingStatus(args: {
    status: NativeCompanionWorkspaceSyncState['sync_onboarding_status'];
  }): Promise<NativeCompanionWorkspaceSyncState>;
  saveSyncStateCursor(args: { cursor: number | null }): Promise<{ cursor: number | null }>;
  saveSyncPackCursor(args: { cursor: number | null }): Promise<{ cursor: number | null }>;
  saveSyncStatePushCursor(args: { cursor: number | null }): Promise<{ cursor: number | null }>;
  saveSyncNodeVersionCursor(args: { cursor: NativeSyncChangeCursor | null }): Promise<{ cursor: NativeSyncChangeCursor | null }>;
  saveSyncNodeVersionPushCursor(args: { cursor: NativeSyncChangeCursor | null }): Promise<{ cursor: NativeSyncChangeCursor | null }>;
  saveSyncReviewLogCursor(args: { cursor: NativeSyncChangeCursor | null }): Promise<{ cursor: NativeSyncChangeCursor | null }>;
  saveSyncReviewLogPushCursor(args: { cursor: NativeSyncChangeCursor | null }): Promise<{ cursor: NativeSyncChangeCursor | null }>;
  saveSyncPushAcks(args: { acks: Array<{
    client_op_id: string;
    identity: SyncPushAck['identity'];
    state_seq?: number | null;
    status: SyncPushAck['status'];
  }> }): Promise<{ saved_client_op_ids: string[] }>;
  saveSyncSettingRecord(args: {
    device_id?: string;
    form_factor?: string;
    key: string;
    platform?: string;
    scope?: string;
    value_json: string;
  }): Promise<{ content_hash: string; object_id: string }>;
  saveSyncNodeReadingRecord(args: { node_id: string; reading_json: string }): Promise<{ content_hash: string; object_id: string }>;
  saveSyncNodeReviewRecord(args: {
    node_id: string;
    review_log_json?: string;
    review_json: string;
  }): Promise<{ content_hash: string; object_id: string }>;
  saveSyncActiveViewState(args: { node_id: string | null }): Promise<{ content_hash: string; object_id: string }>;
  saveSyncNodeViewState(args: {
    node_id: string;
    scroll_top: number;
    source?: 'user-scroll';
  }): Promise<{ content_hash: string; object_id: string }>;
  savePairingCredentials(args: {
    device_id: string;
    device_kind: string;
    device_name: string;
    device_secret: string;
    paired_at: string;
  }): Promise<NativeCompanionPairingState>;
  resolveAttachmentResource(args: { attachment_id: string }): Promise<{
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
  syncAttachmentResources(args: {
    resources: Array<{
      attachment_id: string;
      content_hash: string;
      headers: Record<string, string>;
      url: string;
    }>;
  }): Promise<{ synced_attachment_ids: string[] }>;
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
