import { blob, integer, primaryKey, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const syncObjectState = sqliteTable(
  'sync_object_state',
  {
    objectType: text('object_type').notNull(),
    objectId: text('object_id').notNull(),
    stateSeq: integer('state_seq').notNull(),
    currentVersionId: text('current_version_id'),
    contentHash: text('content_hash').notNull(),
    lastModifiedByDeviceId: text('last_modified_by_device_id').notNull(),
    updatedAt: text('updated_at').notNull(),
    deletedAt: text('deleted_at'),
    syncDirty: integer('sync_dirty', { mode: 'boolean' }).notNull().default(false)
  },
  (table) => [
    primaryKey({ columns: [table.objectType, table.objectId] }),
    uniqueIndex('idx_sync_object_state_state_seq_unique').on(table.stateSeq)
  ]
);

export const syncChangeLog = sqliteTable('sync_change_log', {
  changeId: text('change_id').primaryKey(),
  objectType: text('object_type').notNull(),
  objectId: text('object_id').notNull(),
  changeType: text('change_type').notNull(),
  deviceId: text('device_id').notNull(),
  baseVersionId: text('base_version_id'),
  resultVersionId: text('result_version_id'),
  contentHash: text('content_hash').notNull(),
  payloadJson: text('payload_json').notNull(),
  createdAt: text('created_at').notNull(),
  appliedAt: text('applied_at')
});

export const nodeSyncVersions = sqliteTable('node_sync_versions', {
  versionId: text('version_id').primaryKey(),
  objectId: text('object_id').notNull(),
  parentVersionId: text('parent_version_id'),
  deviceId: text('device_id').notNull(),
  createdAt: text('created_at').notNull(),
  contentHash: text('content_hash').notNull(),
  snapshotJson: text('snapshot_json')
});

export const nodeSyncConflicts = sqliteTable('node_sync_conflicts', {
  conflictVersionId: text('conflict_version_id').primaryKey(),
  objectId: text('object_id').notNull(),
  parentVersionId: text('parent_version_id'),
  deviceId: text('device_id'),
  contentHash: text('content_hash'),
  snapshotJson: text('snapshot_json').notNull(),
  detectedAt: text('detected_at').notNull()
});

export const nodeSyncTombstones = sqliteTable('node_sync_tombstones', {
  nodeId: text('node_id').primaryKey(),
  versionId: text('version_id').notNull(),
  parentVersionId: text('parent_version_id'),
  deviceId: text('device_id').notNull(),
  contentHash: text('content_hash').notNull(),
  snapshotJson: text('snapshot_json').notNull(),
  deletedAt: text('deleted_at').notNull(),
  createdAt: text('created_at').notNull()
});

export const syncPeerCursors = sqliteTable(
  'sync_peer_cursors',
  {
    peerId: text('peer_id').notNull(),
    streamName: text('stream_name').notNull(),
    cursorValue: text('cursor_value').notNull(),
    updatedAt: text('updated_at').notNull()
  },
  (table) => [primaryKey({ columns: [table.peerId, table.streamName] })]
);

export const attachmentBlobs = sqliteTable('attachment_blobs', {
  attachmentId: text('attachment_id').primaryKey(),
  contentHash: text('content_hash'),
  storageKey: text('storage_key'),
  sizeBytes: integer('size_bytes'),
  mimeType: text('mime_type'),
  availability: text('availability').notNull().default('missing'),
  sourceDeviceId: text('source_device_id'),
  createdAt: text('created_at').notNull(),
  cachedAt: text('cached_at'),
  lastVerifiedAt: text('last_verified_at')
});

export const contentBlobs = sqliteTable('content_blobs', {
  hash: text('hash').primaryKey(),
  storageKey: text('storage_key').notNull(),
  kind: text('kind').notNull(),
  mimeType: text('mime_type'),
  compression: text('compression').notNull().default('none'),
  originalSizeBytes: integer('original_size_bytes').notNull(),
  storedSizeBytes: integer('stored_size_bytes').notNull(),
  originalSha256: text('original_sha256').notNull(),
  storedSha256: text('stored_sha256').notNull(),
  availability: text('availability').notNull().default('missing'),
  sourceDeviceId: text('source_device_id'),
  createdAt: text('created_at').notNull(),
  cachedAt: text('cached_at'),
  lastVerifiedAt: text('last_verified_at')
});

export const contentBlobData = sqliteTable('content_blob_data', {
  hash: text('hash').primaryKey(),
  data: blob('data').notNull()
});

export const settingRecords = sqliteTable(
  'setting_records',
  {
    key: text('key').notNull(),
    scope: text('scope').notNull(),
    platform: text('platform').notNull().default('*'),
    formFactor: text('form_factor').notNull().default('*'),
    deviceId: text('device_id').notNull().default('*'),
    valueJson: text('value_json').notNull(),
    contentHash: text('content_hash').notNull(),
    updatedAt: text('updated_at').notNull(),
    deletedAt: text('deleted_at')
  },
  (table) => [primaryKey({ columns: [table.key, table.scope, table.platform, table.formFactor, table.deviceId] })]
);

export const pdfPageText = sqliteTable(
  'pdf_page_text',
  {
    attachmentId: text('attachment_id').notNull(),
    page: integer('page').notNull(),
    text: text('text').notNull(),
    pageWidth: real('page_width'),
    pageHeight: real('page_height')
  },
  (table) => [primaryKey({ columns: [table.attachmentId, table.page] })]
);
