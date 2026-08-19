export const ANDROID_COMPANION_DESKTOP_SOURCE_MIGRATION_STATEMENTS = {
  externalFoldersSourceRefColumn: 'ALTER TABLE external_search_folders ADD COLUMN source_ref TEXT',
  importSourcesSourceLocationColumn: 'ALTER TABLE import_sources ADD COLUMN source_location TEXT',
  importSourcesSourceRefColumn: 'ALTER TABLE import_sources ADD COLUMN source_ref TEXT',
  importSourcesWatchedBindingIdColumn: 'ALTER TABLE import_sources ADD COLUMN watched_binding_id TEXT',
  importSourcesWatchedRelativePathColumn: 'ALTER TABLE import_sources ADD COLUMN watched_relative_path TEXT'
};

export const ANDROID_COMPANION_DESKTOP_SOURCE_MIGRATION_REPAIR_RULES = {
  externalFoldersSourceRef: {
    columnName: 'source_ref', errorMessage: 'Failed to add external folder source reference.',
    statementName: 'externalFoldersSourceRefColumn', tableName: 'external_search_folders'
  },
  importSourcesSourceLocation: {
    columnName: 'source_location', errorMessage: 'Failed to add import source location.',
    statementName: 'importSourcesSourceLocationColumn', tableName: 'import_sources'
  },
  importSourcesSourceRef: {
    columnName: 'source_ref', errorMessage: 'Failed to add import source reference.',
    statementName: 'importSourcesSourceRefColumn', tableName: 'import_sources'
  },
  importSourcesWatchedBindingId: {
    columnName: 'watched_binding_id', errorMessage: 'Failed to add watched binding reference.',
    statementName: 'importSourcesWatchedBindingIdColumn', tableName: 'import_sources'
  },
  importSourcesWatchedRelativePath: {
    columnName: 'watched_relative_path', errorMessage: 'Failed to add watched source location.',
    statementName: 'importSourcesWatchedRelativePathColumn', tableName: 'import_sources'
  }
} as const;
