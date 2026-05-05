import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const externalDocuments = sqliteTable('external_documents', {
  documentId: text('document_id').primaryKey(),
  folderId: text('folder_id').notNull(),
  relativePath: text('relative_path').notNull(),
  fileName: text('file_name').notNull(),
  extension: text('extension').notNull(),
  sourceSizeBytes: integer('source_size_bytes').notNull(),
  sourceModifiedAt: text('source_modified_at').notNull(),
  sourceModifiedMs: integer('source_modified_ms').notNull(),
  contentHash: text('content_hash').notNull(),
  title: text('title').notNull(),
  openingText: text('opening_text'),
  content: text('content').notNull(),
  indexedAt: text('indexed_at').notNull(),
  isPresent: integer('is_present', { mode: 'boolean' }).notNull().default(true),
  missingAt: text('missing_at'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull()
});
