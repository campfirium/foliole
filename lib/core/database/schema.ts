import { integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const nodes = sqliteTable('nodes', {
  id: text('id').primaryKey(),
  parentId: text('parent_id'),
  priority: integer('priority'),
  desiredRetention: real('desired_retention'),
  title: text('title').notNull(),
  isTitleManual: integer('is_title_manual', { mode: 'boolean' }).notNull().default(false),
  content: text('content').notNull().default(''),
  reveal: text('reveal'),
  anchorLink: text('anchor_link'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  deletedAt: text('deleted_at')
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

export const attachments = sqliteTable('attachments', {
  id: text('id').primaryKey(),
  hash: text('hash').notNull().unique(),
  originalName: text('original_name'),
  mimeType: text('mime_type'),
  sizeBytes: integer('size_bytes'),
  createdAt: text('created_at').notNull()
});

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
