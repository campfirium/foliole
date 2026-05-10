import { integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const readwiseSources = sqliteTable(
  'readwise_sources',
  {
    sourceId: text('source_id').primaryKey(),
    readerDocumentId: text('reader_document_id').notNull(),
    readwiseBookId: text('readwise_book_id'),
    title: text('title').notNull().default(''),
    author: text('author'),
    category: text('category'),
    location: text('location'),
    tagsJson: text('tags_json').notNull().default('[]'),
    sourceUrl: text('source_url'),
    rawSourceUrl: text('raw_source_url'),
    rawSourceUrlStatus: text('raw_source_url_status').notNull().default('unknown'),
    remoteUpdatedAt: text('remote_updated_at'),
    syncCursor: text('sync_cursor'),
    syncStatus: text('sync_status').notNull().default('idle'),
    sourceState: text('source_state').notNull().default('external'),
    promotionLock: integer('promotion_lock', { mode: 'boolean' }).notNull().default(false),
    internalNodeId: text('internal_node_id'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull()
  },
  (table) => [uniqueIndex('idx_readwise_sources_reader_document').on(table.readerDocumentId)]
);

export const readwiseSourceAnnotations = sqliteTable(
  'readwise_source_annotations',
  {
    sourceId: text('source_id').notNull(),
    readwiseBookId: text('readwise_book_id').notNull(),
    highlightId: text('highlight_id').notNull(),
    readerDocumentId: text('reader_document_id').notNull(),
    parentId: text('parent_id'),
    annotationKind: text('annotation_kind').notNull().default('highlight'),
    text: text('text'),
    note: text('note'),
    location: text('location'),
    remoteUpdatedAt: text('remote_updated_at'),
    deletedAt: text('deleted_at'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull()
  },
  (table) => [primaryKey({ columns: [table.readwiseBookId, table.highlightId] })]
);
