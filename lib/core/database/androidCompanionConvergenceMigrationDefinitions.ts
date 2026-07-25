export const ANDROID_COMPANION_CONVERGENCE_MIGRATION_STATEMENTS = {
  nodesAnchorResolutionStatusColumn: 'ALTER TABLE nodes ADD COLUMN anchor_resolution_status TEXT',
  nodesAnchorSourceVersionIdColumn: 'ALTER TABLE nodes ADD COLUMN anchor_source_version_id TEXT',
  nodeSyncVersionsBodyTextColumn: 'ALTER TABLE node_sync_versions ADD COLUMN body_text TEXT',
  syncVersionParentsBackfill: `INSERT OR IGNORE INTO node_sync_version_parents (version_id, parent_version_id, ordinal)
    SELECT version_id, parent_version_id, 0 FROM node_sync_versions WHERE parent_version_id IS NOT NULL`,
  syncCurrentVersionBodyTextBackfill: `UPDATE node_sync_versions SET body_text = COALESCE(
    (SELECT CAST(data AS TEXT) FROM content_blob_data
      WHERE hash = (SELECT body_blob_hash FROM nodes WHERE current_version_id = node_sync_versions.version_id)),
    (SELECT content FROM nodes WHERE current_version_id = node_sync_versions.version_id)
  ) WHERE version_id IN (SELECT current_version_id FROM nodes WHERE current_version_id IS NOT NULL)`
};

export const ANDROID_COMPANION_CONVERGENCE_MIGRATION_ACTION_TYPES = {
  addNodesAnchorResolutionStatusIfMissing: 'addNodesAnchorResolutionStatusIfMissing',
  addNodesAnchorSourceVersionIdIfMissing: 'addNodesAnchorSourceVersionIdIfMissing',
  addNodeSyncVersionsBodyTextIfMissing: 'addNodeSyncVersionsBodyTextIfMissing',
  backfillSyncConflictConvergence: 'backfillSyncConflictConvergence'
} as const;

export const ANDROID_COMPANION_CONVERGENCE_MIGRATION_REPAIR_RULES = {
  nodesAnchorResolutionStatus: {
    columnName: 'anchor_resolution_status',
    errorMessage: 'Failed to add node anchor resolution status column.',
    statementName: 'nodesAnchorResolutionStatusColumn',
    tableName: 'nodes'
  },
  nodesAnchorSourceVersionId: {
    columnName: 'anchor_source_version_id',
    errorMessage: 'Failed to add node anchor source version column.',
    statementName: 'nodesAnchorSourceVersionIdColumn',
    tableName: 'nodes'
  },
  nodeSyncVersionsBodyText: {
    columnName: 'body_text',
    errorMessage: 'Failed to add node version body text column.',
    statementName: 'nodeSyncVersionsBodyTextColumn',
    tableName: 'node_sync_versions'
  },
  syncConflictConvergence: {
    bodyTextStatementName: 'syncCurrentVersionBodyTextBackfill',
    errorMessage: 'Failed to backfill companion sync convergence state.',
    parentStatementName: 'syncVersionParentsBackfill'
  }
} as const;
