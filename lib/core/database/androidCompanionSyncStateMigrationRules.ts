export const ANDROID_COMPANION_SYNC_STATE_MIGRATION_REPAIR_RULES = {
  syncObjectStateSequence: {
    createNextErrorMessage: 'Failed to create sync object state repair table.',
    createNextStatementName: 'syncObjectStateNextTable',
    dropLegacyErrorMessage: 'Failed to drop legacy sync object state table.',
    dropLegacyStatementName: 'syncObjectStateDropLegacyTable',
    indexStatementNames: ['syncObjectStateSeqIndex', 'syncObjectStateTypeSeqIndex'],
    indexStatementsErrorMessage: 'Failed to create sync object state indexes.',
    indexStatementErrorMessage: 'Failed to create sync object state index.',
    legacyRowsErrorMessage: 'Failed to load legacy sync object state rows.',
    legacyRowsQueryName: 'migrationLegacySyncObjectStateRows',
    legacyRowsResultKey: 'rows',
    nextInsertErrorMessage: 'Failed to copy legacy sync object state row.',
    nextInsertMutationName: 'migrationSyncObjectStateNextInsert',
    renameNextErrorMessage: 'Failed to rename sync object state repair table.',
    renameNextStatementName: 'syncObjectStateRenameNextTable',
    rowKeys: {
      contentHash: 'content_hash',
      currentVersionId: 'current_version_id',
      deletedAt: 'deleted_at',
      lastModifiedByDeviceId: 'last_modified_by_device_id',
      objectId: 'object_id',
      objectType: 'object_type',
      syncDirty: 'sync_dirty',
      updatedAt: 'updated_at'
    },
    stateSeqColumnName: 'state_seq',
    tableName: 'sync_object_state'
  }
} as const;
