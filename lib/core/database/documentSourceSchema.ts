import { sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const documentSources = sqliteTable(
  'document_sources',
  {
    sourceId: text('source_id').primaryKey(),
    provider: text('provider').notNull(),
    providerDocumentId: text('provider_document_id').notNull(),
    sourceKind: text('source_kind').notNull(),
    sourceName: text('source_name').notNull().default(''),
    sourceLocator: text('source_locator').notNull().default(''),
    sourceFingerprint: text('source_fingerprint').notNull(),
    contentFingerprint: text('content_fingerprint').notNull().default(''),
    presentationState: text('presentation_state').notNull().default('external'),
    availabilityState: text('availability_state').notNull().default('available'),
    syncStatus: text('sync_status').notNull().default('idle'),
    internalNodeId: text('internal_node_id'),
    internalizedAt: text('internalized_at'),
    title: text('title'),
    author: text('author'),
    sourceUrl: text('source_url'),
    remoteUpdatedAt: text('remote_updated_at'),
    tagsJson: text('tags_json').notNull().default('[]'),
    firstSeenAt: text('first_seen_at').notNull(),
    lastSeenAt: text('last_seen_at').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull()
  },
  (table) => [
    uniqueIndex('idx_document_sources_provider_document').on(table.provider, table.providerDocumentId),
    uniqueIndex('idx_document_sources_fingerprint').on(table.sourceFingerprint)
  ]
);
