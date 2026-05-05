import { integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const nodes = sqliteTable('nodes', {
  id: text('id').primaryKey(),
  parentId: text('parent_id'),
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

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: text('updated_at').notNull()
});
