import { sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const importSources = sqliteTable('import_sources', {
  sourceFingerprint: text('source_fingerprint').primaryKey(),
  provider: text('provider').notNull(),
  sourceKind: text('source_kind').notNull(),
  sourceName: text('source_name').notNull(),
  sourceLocator: text('source_locator').notNull(),
  firstImportedAt: text('first_imported_at').notNull(),
  lastImportedAt: text('last_imported_at').notNull(),
  lastContentFingerprint: text('last_content_fingerprint').notNull(),
  latestNodeId: text('latest_node_id'),
  sourceRef: text('source_ref'),
  sourceLocation: text('source_location')
});

export const desktopSources = sqliteTable('desktop_sources', {
  sourceRef: text('source_ref').primaryKey(),
  sourceType: text('source_type').notNull(),
  configRef: text('config_ref').notNull(),
  hostName: text('host_name').notNull(),
  hostPlatform: text('host_platform').notNull(),
  rootPath: text('root_path').notNull(),
  pathFlavor: text('path_flavor').notNull(),
  typeSettingsJson: text('type_settings_json').notNull().default('{}'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull()
});
