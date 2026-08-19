import { ANDROID_COMPANION_CONVERGENCE_MUTATION_DEFINITIONS } from './androidCompanionConvergenceMutationDefinitions.js';
import { ANDROID_COMPANION_RESOURCE_STATUSES } from './androidCompanionSyncProtocolDefinitions.js';

export { ANDROID_COMPANION_APP_DATA_CLEAR_MUTATIONS } from './androidCompanionAppDataClearMutationDefinitions.js';

const RESOURCE_STATUS = ANDROID_COMPANION_RESOURCE_STATUSES;

export const ANDROID_COMPANION_MUTATION_DEFINITIONS = {
  ...ANDROID_COMPANION_CONVERGENCE_MUTATION_DEFINITIONS,
  syncReviewLogInsert:
    'INSERT OR IGNORE INTO review_log (' +
    'id, op_id, device_id, node_id, grade, scheduler_version, reviewed_at, due_before, stability_before, ' +
    'difficulty_before, due_after, stability_after, difficulty_after' +
    ') VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  syncNodeOpenStateDelete: 'DELETE FROM node_open_state WHERE node_id = ?',
  syncNodeOpenStateUpsert:
    'INSERT INTO node_open_state (node_id, last_opened_at) VALUES (?, ?) ' +
    'ON CONFLICT(node_id) DO UPDATE SET last_opened_at = excluded.last_opened_at ' +
    'WHERE excluded.last_opened_at > node_open_state.last_opened_at',
  syncNodeReadingDelete: 'DELETE FROM node_reading WHERE node_id = ?',
  syncNodeReadingHostStateDelete: 'DELETE FROM node_reading_host_state WHERE node_id = ?',
  syncNodeReadingUpsert:
    'INSERT OR REPLACE INTO node_reading (' +
    'node_id, interval_duration_ms, interval_growth_factor, last_handled_at, next_at, priority, repetition_count, state' +
    ') VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  syncNodeReadingHostStateUpsert:
    'INSERT OR REPLACE INTO node_reading_host_state (node_id, host_name, reading_position, updated_at) VALUES (?, ?, ?, ?)',
  syncNodeReviewDelete: 'DELETE FROM node_review WHERE node_id = ?',
  syncNodeReviewUpsert:
    'INSERT OR REPLACE INTO node_review (' +
    'node_id, due, last_review_at, state, stability, difficulty, elapsed_days, scheduled_days, reps, lapses' +
    ') VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  syncSettingRecordUpsert:
    'INSERT OR REPLACE INTO setting_records (' +
    'key, scope, platform, form_factor, host_name, value_json, content_hash, updated_at' +
    ') VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  syncViewActiveNodeDelete: "DELETE FROM workspace_meta WHERE key = 'active_node_id'",
  syncViewActiveNodeUpsert:
    'INSERT OR REPLACE INTO workspace_meta (key, value, updated_at) VALUES (?, ?, ?)',
  syncViewNodeStateDelete: 'DELETE FROM node_view_state WHERE node_id = ? AND host_name = ?',
  syncViewNodeStateUpsert:
    'INSERT OR REPLACE INTO node_view_state (' +
    'node_id, host_name, scroll_top, selection_from, selection_to, source, updated_at' +
    ') VALUES (?, ?, ?, ?, ?, ?, ?)',
  syncExternalDocumentMarkMissing:
    'UPDATE external_documents SET is_present = 0, missing_at = ?, updated_at = ? WHERE document_id = ?',
  syncExternalDocumentUpsert:
    'INSERT OR REPLACE INTO external_documents (' +
    'document_id, folder_id, relative_path, file_name, extension, source_size_bytes, source_modified_at, ' +
    'source_modified_ms, content_hash, title, opening_text, body_blob_hash, content, indexed_at, is_present, ' +
    'missing_at, created_at, updated_at' +
    ') VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  textBodyBlobManifestInsert:
    'INSERT OR IGNORE INTO content_blobs (' +
    'hash, storage_key, kind, mime_type, compression, original_size_bytes, stored_size_bytes, original_sha256, ' +
    'stored_sha256, availability, created_at, cached_at, last_verified_at' +
    ') VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  textBodyBlobDataInsert: 'INSERT OR IGNORE INTO content_blob_data (hash, data) VALUES (?, ?)',
  nodeAttachmentDeleteByNode: 'DELETE FROM node_attachments WHERE node_id = ?',
  nodeAttachmentUpsert: 'INSERT OR REPLACE INTO node_attachments (node_id, attachment_id, role) VALUES (?, ?, ?)',
  attachmentResourceMarkCached:
    "UPDATE attachment_blobs SET storage_key = ?, availability = '" +
    RESOURCE_STATUS.cached +
    "', cached_at = ?, last_verified_at = ? WHERE attachment_id = ?",
  attachmentResourceMarkFailed:
    "UPDATE attachment_blobs SET availability = '" + RESOURCE_STATUS.failed + "' WHERE attachment_id = ?",
  contentBlobDataReplace: 'INSERT OR REPLACE INTO content_blob_data (hash, data) VALUES (?, ?)',
  contentBlobMarkCached:
    "UPDATE content_blobs SET availability = '" +
    RESOURCE_STATUS.cached +
    "', cached_at = ?, last_verified_at = ? WHERE hash = ?",
  contentBlobMarkFetching:
    "UPDATE content_blobs SET availability = '" + RESOURCE_STATUS.fetching + "' WHERE hash = ?",
  contentBlobMarkFailed: "UPDATE content_blobs SET availability = '" + RESOURCE_STATUS.failed + "' WHERE hash = ?",
  migrationSyncObjectStateNextInsert:
    'INSERT INTO sync_object_state_next (' +
    'object_type, object_id, state_seq, current_version_id, content_hash, last_modified_by_device_id, ' +
    'updated_at, deleted_at, sync_dirty, base_content_hash' +
    ') VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  companionMetaDeleteByKey: 'DELETE FROM companion_meta WHERE key = ?',
  companionMetaDeleteExceptDeviceId: "DELETE FROM companion_meta WHERE key <> 'device_id'",
  companionMetaUpsert: 'INSERT OR REPLACE INTO companion_meta (key, value, updated_at) VALUES (?, ?, ?)',
  appDataClearSyncGroupLocalState: 'DELETE FROM sync_group_local_state',
  appDataClearSyncGroupMembers: 'DELETE FROM sync_group_members',
  appDataClearSyncGroups: 'DELETE FROM sync_groups',
  appDataClearSyncDeliveryReceipts: 'DELETE FROM sync_delivery_receipts',
  appDataClearSyncPeerCursors: 'DELETE FROM sync_peer_cursors',
  appDataClearSyncChangeLog: 'DELETE FROM sync_change_log',
  appDataClearSyncObjectState: 'DELETE FROM sync_object_state',
  appDataClearNodeSyncConflicts: 'DELETE FROM node_sync_conflicts',
  appDataClearNodeTextAlternatives: 'DELETE FROM node_text_alternatives',
  appDataClearNodeSyncVersionParents: 'DELETE FROM node_sync_version_parents',
  appDataClearNodeSyncTombstones: 'DELETE FROM node_sync_tombstones',
  appDataClearNodeSyncVersions: 'DELETE FROM node_sync_versions',
  appDataClearNodeViewState: 'DELETE FROM node_view_state',
  appDataClearNodeReadingHostState: 'DELETE FROM node_reading_host_state',
  appDataClearNodeOrder: 'DELETE FROM node_order',
  appDataClearNodeOpenState: 'DELETE FROM node_open_state',
  appDataClearNodeAttachments: 'DELETE FROM node_attachments',
  appDataClearAttachmentBlobs: 'DELETE FROM attachment_blobs',
  appDataClearAttachments: 'DELETE FROM attachments',
  appDataClearPdfPageText: 'DELETE FROM pdf_page_text',
  appDataClearContentBlobData: 'DELETE FROM content_blob_data',
  appDataClearContentBlobs: 'DELETE FROM content_blobs',
  appDataClearExternalDocuments: 'DELETE FROM external_documents',
  appDataClearExternalSearchFolders: 'DELETE FROM external_search_folders',
  appDataClearImportSources: 'DELETE FROM import_sources',
  appDataClearReviewLog: 'DELETE FROM review_log',
  appDataClearNodeReading: 'DELETE FROM node_reading',
  appDataClearNodeReview: 'DELETE FROM node_review',
  appDataClearSettingRecords: 'DELETE FROM setting_records',
  appDataClearNodes: 'DELETE FROM nodes',
  appDataClearWorkspaceMeta: 'DELETE FROM workspace_meta',
  syncStateUpsert:
    'INSERT OR REPLACE INTO sync_object_state (' +
    'object_type, object_id, state_seq, current_version_id, content_hash, base_content_hash, ' +
    'last_modified_by_device_id, updated_at, deleted_at, sync_dirty' +
    ') VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
};

export const ANDROID_COMPANION_MUTATION_ASSET_KEYS = {
  appDataClearMutations: 'appDataClearMutations',
  hostSupportMutations: 'hostSupportMutations',
  mutationShape: 'mutationShape',
  resourceMutations: 'resourceMutations',
  runtimeMutations: 'runtimeMutations',
  statements: 'statements',
  syncApplyMutations: 'syncApplyMutations'
} as const;

export const ANDROID_COMPANION_MUTATION_SHAPE_KEYS = {
  appDataClearMutation: {
    statementName: 'statementName',
    table: 'table'
  }
} as const;

export const ANDROID_COMPANION_RESOURCE_MUTATION_RULES = {
  groupKeys: { attachmentResources: 'attachmentResources', contentBlobs: 'contentBlobs' },
  attachmentResources: {
    markCachedMutationName: 'attachmentResourceMarkCached',
    markFailedMutationName: 'attachmentResourceMarkFailed'
  },
  contentBlobs: {
    dataReplaceMutationName: 'contentBlobDataReplace',
    markCachedMutationName: 'contentBlobMarkCached',
    markFailedMutationName: 'contentBlobMarkFailed',
    markFetchingMutationName: 'contentBlobMarkFetching'
  }
} as const;

export const ANDROID_COMPANION_RUNTIME_MUTATION_RULES = {
  groupKeys: { syncState: 'syncState' },
  syncState: {
    upsertMutationName: 'syncStateUpsert'
  }
} as const;

export const ANDROID_COMPANION_HOST_SUPPORT_MUTATION_RULES = {
  groupKeys: { appData: 'appData', companionMeta: 'companionMeta', nodeAttachments: 'nodeAttachments', textBodyBlobs: 'textBodyBlobs' },
  appData: {
    deleteMetaExceptDeviceMutationName: 'companionMetaDeleteExceptDeviceId'
  },
  companionMeta: {
    deleteByKeyMutationName: 'companionMetaDeleteByKey',
    upsertMutationName: 'companionMetaUpsert'
  },
  nodeAttachments: {
    deleteByNodeMutationName: 'nodeAttachmentDeleteByNode',
    upsertMutationName: 'nodeAttachmentUpsert'
  },
  textBodyBlobs: {
    dataInsertMutationName: 'textBodyBlobDataInsert',
    manifestInsertMutationName: 'textBodyBlobManifestInsert'
  }
} as const;

export const ANDROID_COMPANION_SYNC_APPLY_MUTATION_RULES = {
  groupKeys: { documents: 'documents', learning: 'learning', openState: 'openState', reviewLog: 'reviewLog', settings: 'settings', viewState: 'viewState' },
  documents: {
    markMissingMutationName: 'syncExternalDocumentMarkMissing',
    upsertMutationName: 'syncExternalDocumentUpsert'
  },
  learning: {
    readingDeleteMutationName: 'syncNodeReadingDelete',
    readingDeviceStateDeleteMutationName: 'syncNodeReadingHostStateDelete',
    readingDeviceStateUpsertMutationName: 'syncNodeReadingHostStateUpsert',
    readingUpsertMutationName: 'syncNodeReadingUpsert',
    reviewDeleteMutationName: 'syncNodeReviewDelete',
    reviewUpsertMutationName: 'syncNodeReviewUpsert'
  },
  openState: {
    deleteMutationName: 'syncNodeOpenStateDelete',
    upsertMutationName: 'syncNodeOpenStateUpsert'
  },
  reviewLog: {
    insertMutationName: 'syncReviewLogInsert'
  },
  settings: {
    upsertMutationName: 'syncSettingRecordUpsert'
  },
  viewState: {
    activeNodeDeleteMutationName: 'syncViewActiveNodeDelete',
    activeNodeUpsertMutationName: 'syncViewActiveNodeUpsert',
    nodeStateDeleteMutationName: 'syncViewNodeStateDelete',
    nodeStateUpsertMutationName: 'syncViewNodeStateUpsert'
  }
} as const;
