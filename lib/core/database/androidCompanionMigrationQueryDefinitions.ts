export const ANDROID_COMPANION_MIGRATION_QUERY_DEFINITIONS = {
  migrationLegacySyncObjectStateRows: {
    resultKey: 'rows',
    sql:
      'SELECT object_type, object_id, current_version_id, content_hash, last_modified_by_device_id, updated_at, deleted_at, sync_dirty ' +
      'FROM sync_object_state ORDER BY updated_at ASC, object_type ASC, object_id ASC',
    columns: [
      { key: 'object_type', source: 'object_type', type: 'string' },
      { key: 'object_id', source: 'object_id', type: 'string' },
      { key: 'current_version_id', source: 'current_version_id', type: 'nullableString' },
      { key: 'content_hash', source: 'content_hash', type: 'string' },
      { key: 'last_modified_by_device_id', source: 'last_modified_by_device_id', type: 'string' },
      { key: 'updated_at', source: 'updated_at', type: 'string' },
      { key: 'deleted_at', source: 'deleted_at', type: 'nullableString' },
      { key: 'sync_dirty', source: 'sync_dirty', type: 'long' }
    ]
  }
};
