import { integer, primaryKey, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const nodes = sqliteTable('nodes', {
  id: text('id').primaryKey(),
  parentId: text('parent_id'),
  kind: text('kind').notNull().default('topic'),
  priority: integer('priority'),
  desiredRetention: real('desired_retention'),
  title: text('title').notNull(),
  isTitleManual: integer('is_title_manual', { mode: 'boolean' }).notNull().default(false),
  hideTitleHeading: integer('hide_title_heading', { mode: 'boolean' }).notNull().default(false),
  content: text('content').notNull().default(''),
  openingText: text('opening_text'),
  virtualFilter: text('virtual_filter'),
  reveal: text('reveal'),
  anchorLink: text('anchor_link'),
  imageRegions: text('image_regions'),
  position: integer('position'),
  currentVersionId: text('current_version_id'),
  lastModifiedByDeviceId: text('last_modified_by_device_id'),
  syncDirty: integer('sync_dirty', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  deletedAt: text('deleted_at')
});

export const nodeSyncVersions = sqliteTable('node_sync_versions', {
  versionId: text('version_id').primaryKey(),
  objectId: text('object_id').notNull(),
  parentVersionId: text('parent_version_id'),
  deviceId: text('device_id').notNull(),
  createdAt: text('created_at').notNull(),
  contentHash: text('content_hash').notNull()
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

export const syncPeers = sqliteTable('sync_peers', {
  peerId: text('peer_id').primaryKey(),
  status: text('status').notNull().default('paired'),
  lastSyncedAt: text('last_synced_at'),
  lastSeenVersionCursor: text('last_seen_version_cursor'),
  updatedAt: text('updated_at').notNull()
});

export const nodeReview = sqliteTable('node_review', {
  nodeId: text('node_id').primaryKey(),
  due: text('due').notNull(),
  lastReviewAt: text('last_review_at'),
  state: integer('state').notNull().default(0),
  stability: real('stability').notNull().default(0),
  difficulty: real('difficulty').notNull().default(0),
  elapsedDays: integer('elapsed_days').notNull().default(0),
  scheduledDays: integer('scheduled_days').notNull().default(0),
  reps: integer('reps').notNull().default(0),
  lapses: integer('lapses').notNull().default(0)
});

export const nodeReading = sqliteTable('node_reading', {
  nodeId: text('node_id').primaryKey(),
  intervalDurationMs: integer('interval_duration_ms').notNull().default(0),
  intervalGrowthFactor: real('interval_growth_factor').notNull().default(1),
  lastHandledAt: text('last_handled_at').notNull(),
  nextAt: text('next_at').notNull(),
  priority: real('priority').notNull().default(0),
  readingPosition: integer('reading_position').notNull().default(0),
  repetitionCount: integer('repetition_count').notNull().default(0),
  state: text('state').notNull().default('active')
});

export const reviewLog = sqliteTable('review_log', {
  id: text('id').primaryKey(),
  opId: text('op_id').notNull().unique(),
  deviceId: text('device_id').notNull(),
  nodeId: text('node_id').notNull(),
  grade: integer('grade').notNull(),
  schedulerVersion: text('scheduler_version').notNull(),
  reviewedAt: text('reviewed_at').notNull(),
  dueBefore: text('due_before').notNull(),
  stabilityBefore: real('stability_before').notNull(),
  difficultyBefore: real('difficulty_before').notNull(),
  dueAfter: text('due_after').notNull(),
  stabilityAfter: real('stability_after').notNull(),
  difficultyAfter: real('difficulty_after').notNull()
});

export const nodeOrder = sqliteTable('node_order', {
  nodeId: text('node_id').primaryKey(),
  position: integer('position').notNull()
});

export const workspaceMeta = sqliteTable('workspace_meta', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: text('updated_at').notNull()
});

export const nodeViewState = sqliteTable('node_view_state', {
  nodeId: text('node_id').primaryKey(),
  scrollTop: integer('scroll_top').notNull().default(0),
  selectionFrom: integer('selection_from'),
  selectionTo: integer('selection_to'),
  updatedAt: text('updated_at').notNull()
});

export const mirrorArticles = sqliteTable('mirror_articles', {
  articleId: text('article_id').primaryKey(),
  relativePath: text('relative_path').notNull(),
  mirroredAt: text('mirrored_at').notNull()
});

export const attachments = sqliteTable('attachments', {
  id: text('id').primaryKey(),
  originalName: text('original_name'),
  mimeType: text('mime_type'),
  sizeBytes: integer('size_bytes'),
  createdAt: text('created_at').notNull(),
  pdfIndexStatus: text('pdf_index_status'),
  pdfIndexedAt: text('pdf_indexed_at'),
  pdfIndexError: text('pdf_index_error'),
  pdfIndexVersion: integer('pdf_index_version'),
  pdfIndexAttempt: integer('pdf_index_attempt')
});

export const nodeAttachments = sqliteTable(
  'node_attachments',
  {
    nodeId: text('node_id').notNull(),
    attachmentId: text('attachment_id').notNull(),
    role: text('role').notNull()
  },
  (table) => [primaryKey({ columns: [table.nodeId, table.attachmentId, table.role] })]
);

export const importSources = sqliteTable('import_sources', {
  sourceFingerprint: text('source_fingerprint').primaryKey(),
  provider: text('provider').notNull(),
  sourceKind: text('source_kind').notNull(),
  sourceName: text('source_name').notNull(),
  sourceLocator: text('source_locator').notNull(),
  firstImportedAt: text('first_imported_at').notNull(),
  lastImportedAt: text('last_imported_at').notNull(),
  lastContentFingerprint: text('last_content_fingerprint').notNull(),
  latestNodeId: text('latest_node_id')
});

export const importRuns = sqliteTable('import_runs', {
  id: text('id').primaryKey(),
  sourceFingerprint: text('source_fingerprint').notNull(),
  provider: text('provider').notNull(),
  sourceKind: text('source_kind').notNull(),
  sourceName: text('source_name').notNull(),
  sourceLocator: text('source_locator').notNull(),
  contentFingerprint: text('content_fingerprint').notNull(),
  duplicateSemantic: text('duplicate_semantic').notNull(),
  resultStatus: text('result_status').notNull(),
  nodeId: text('node_id'),
  importedAt: text('imported_at').notNull(),
  degradedReason: text('degraded_reason'),
  failureReason: text('failure_reason')
});

export const keepImportItems = sqliteTable('keep_import_items', {
  ruleId: text('rule_id').notNull(),
  sourcePath: text('source_path').notNull(),
  sourceMtimeMs: integer('source_mtime_ms').notNull(),
  sourceSizeBytes: integer('source_size_bytes').notNull(),
  highlightSourceMtimeMs: integer('highlight_source_mtime_ms'),
  highlightSourceSizeBytes: integer('highlight_source_size_bytes'),
  hasSourceUpdate: integer('has_source_update', { mode: 'boolean' }).notNull().default(false),
  lastNodeId: text('last_node_id'),
  lastStatus: text('last_status').notNull(),
  firstSeenAt: text('first_seen_at').notNull(),
  lastSeenAt: text('last_seen_at').notNull(),
  lastImportedAt: text('last_imported_at')
});

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: text('updated_at').notNull()
});

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
