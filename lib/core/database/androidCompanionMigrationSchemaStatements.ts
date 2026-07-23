import {
  ANDROID_COMPANION_NODE_PROVENANCE_MIGRATION_ACTION_TYPES,
  ANDROID_COMPANION_NODE_PROVENANCE_MIGRATION_PLAN_STEP,
  ANDROID_COMPANION_NODE_PROVENANCE_MIGRATION_REPAIR_RULES,
  ANDROID_COMPANION_NODE_PROVENANCE_MIGRATION_STATEMENTS
} from './androidCompanionNodeProvenanceMigration.js';

export const ANDROID_COMPANION_MIGRATION_SCHEMA_STATEMENTS = {
  ...ANDROID_COMPANION_NODE_PROVENANCE_MIGRATION_STATEMENTS,
  nodesEnableShortTermColumn: 'ALTER TABLE nodes ADD COLUMN enable_short_term INTEGER',
  nodesSequentialReadingEnabledColumn: 'ALTER TABLE nodes ADD COLUMN sequential_reading_enabled INTEGER',
  nodesShelvedAtColumn: 'ALTER TABLE nodes ADD COLUMN shelved_at TEXT',
  nodesManualChildOrderColumn: 'ALTER TABLE nodes ADD COLUMN manual_child_order TEXT',
  nodeViewStateSourceColumn: "ALTER TABLE node_view_state ADD COLUMN source TEXT NOT NULL DEFAULT 'user-scroll'",
  syncObjectStateDropLegacyTable: 'DROP TABLE sync_object_state',
  syncObjectStateBaseContentHashColumn: 'ALTER TABLE sync_object_state ADD COLUMN base_content_hash TEXT',
  syncObjectStateRenameNextTable: 'ALTER TABLE sync_object_state_next RENAME TO sync_object_state',
  syncObjectStateNextTable: `CREATE TABLE sync_object_state_next (
    object_type TEXT NOT NULL,
    object_id TEXT NOT NULL,
    state_seq INTEGER NOT NULL,
    current_version_id TEXT,
    content_hash TEXT NOT NULL,
    last_modified_by_device_id TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,
    sync_dirty INTEGER NOT NULL DEFAULT 0,
    base_content_hash TEXT,
    PRIMARY KEY (object_type, object_id),
    UNIQUE (state_seq)
  )`,
  syncObjectStateSeqIndex: 'CREATE INDEX IF NOT EXISTS idx_sync_object_state_seq ON sync_object_state (state_seq)',
  syncObjectStateTypeSeqIndex:
    'CREATE INDEX IF NOT EXISTS idx_sync_object_state_type_seq ON sync_object_state (object_type, state_seq)'
};

export const ANDROID_COMPANION_MIGRATION_ACTION_TYPES = {
  ...ANDROID_COMPANION_NODE_PROVENANCE_MIGRATION_ACTION_TYPES,
  addNodesEnableShortTermIfMissing: 'addNodesEnableShortTermIfMissing',
  addNodesSequentialReadingEnabledIfMissing: 'addNodesSequentialReadingEnabledIfMissing',
  addNodesShelvedAtIfMissing: 'addNodesShelvedAtIfMissing',
  addNodesManualChildOrderIfMissing: 'addNodesManualChildOrderIfMissing',
  addNodeViewStateSourceIfMissing: 'addNodeViewStateSourceIfMissing',
  addSyncBaseContentHashIfMissing: 'addSyncBaseContentHashIfMissing',
  backfillNodeAttachmentsFromVersions: 'backfillNodeAttachmentsFromVersions',
  installSchema: 'installSchema',
  migrateSyncObjectStateSequence: 'migrateSyncObjectStateSequence'
} as const;

export const ANDROID_COMPANION_MIGRATION_ACTION_KEYS = {
  errorMessage: 'errorMessage',
  type: 'type'
} as const;

export const ANDROID_COMPANION_MIGRATION_ASSET_KEYS = {
  coreStatements: 'statements',
  migrationPlan: 'plan',
  migrationStatementsByName: 'statementsByName'
} as const;

export const ANDROID_COMPANION_MIGRATION_DEFAULT_MESSAGES = {
  installSchemaErrorMessage: 'Failed to install companion schema.'
} as const;

export const ANDROID_COMPANION_MIGRATION_PLAN_KEYS = {
  actions: 'actions',
  beforeVersion: 'beforeVersion'
} as const;

export const ANDROID_COMPANION_MIGRATION_REPAIR_RULE_KEYS = {
  columnName: 'columnName',
  errorMessage: 'errorMessage',
  statementName: 'statementName',
  tableName: 'tableName'
} as const;

export const ANDROID_COMPANION_MIGRATION_PLAN = [
  {
    actions: [{ errorMessage: 'Failed to upgrade companion schema.', type: 'installSchema' }],
    beforeVersion: 4
  },
  {
    actions: [
      { type: 'migrateSyncObjectStateSequence' },
      { errorMessage: 'Failed to upgrade companion sync schema.', type: 'installSchema' }
    ],
    beforeVersion: 5
  },
  {
    actions: [{ errorMessage: 'Failed to upgrade companion node version schema.', type: 'installSchema' }],
    beforeVersion: 6
  },
  {
    actions: [{ errorMessage: 'Failed to upgrade companion review log schema.', type: 'installSchema' }],
    beforeVersion: 7
  },
  {
    actions: [{ errorMessage: 'Failed to upgrade companion attachment link schema.', type: 'installSchema' }],
    beforeVersion: 8
  },
  {
    actions: [{ type: 'backfillNodeAttachmentsFromVersions' }],
    beforeVersion: 9
  },
  {
    actions: [{ errorMessage: 'Failed to upgrade companion content blob schema.', type: 'installSchema' }],
    beforeVersion: 10
  },
  {
    actions: [{ errorMessage: 'Failed to upgrade companion content blob data schema.', type: 'installSchema' }],
    beforeVersion: 11
  },
  {
    actions: [
      { errorMessage: 'Failed to upgrade companion view state source schema.', type: 'installSchema' },
      { type: 'addNodeViewStateSourceIfMissing' }
    ],
    beforeVersion: 12
  },
  {
    actions: [
      { errorMessage: 'Failed to upgrade companion push base reference schema.', type: 'installSchema' },
      { type: 'addSyncBaseContentHashIfMissing' }
    ],
    beforeVersion: 13
  },
  {
    actions: [{ errorMessage: 'Failed to upgrade companion push ack schema.', type: 'installSchema' }],
    beforeVersion: 14
  },
  {
    actions: [{ errorMessage: 'Failed to upgrade companion core indexes.', type: 'installSchema' }],
    beforeVersion: 15
  },
  {
    actions: [
      { errorMessage: 'Failed to upgrade companion node scheduling schema.', type: 'installSchema' },
      { type: 'addNodesEnableShortTermIfMissing' }
    ],
    beforeVersion: 16
  },
  {
    actions: [
      { errorMessage: 'Failed to upgrade companion sequential reading schema.', type: 'installSchema' },
      { type: 'addNodesSequentialReadingEnabledIfMissing' }
    ],
    beforeVersion: 17
  },
  {
    actions: [
      { errorMessage: 'Failed to upgrade companion shelved topic schema.', type: 'installSchema' },
      { type: 'addNodesManualChildOrderIfMissing' },
      { type: 'addNodesShelvedAtIfMissing' }
    ],
    beforeVersion: 18
  },
  ANDROID_COMPANION_NODE_PROVENANCE_MIGRATION_PLAN_STEP,
  {
    actions: [{ errorMessage: 'Failed to upgrade companion node open state schema.', type: 'installSchema' }],
    beforeVersion: 20
  }
] as const;

export const ANDROID_COMPANION_MIGRATION_REPAIR_RULES = {
  ...ANDROID_COMPANION_NODE_PROVENANCE_MIGRATION_REPAIR_RULES,
  nodesEnableShortTerm: {
    columnName: 'enable_short_term',
    errorMessage: 'Failed to add node short-term scheduling column.',
    statementName: 'nodesEnableShortTermColumn',
    tableName: 'nodes'
  },
  nodesSequentialReadingEnabled: {
    columnName: 'sequential_reading_enabled',
    errorMessage: 'Failed to add node sequential reading column.',
    statementName: 'nodesSequentialReadingEnabledColumn',
    tableName: 'nodes'
  },
  nodesShelvedAt: {
    columnName: 'shelved_at',
    errorMessage: 'Failed to add node shelved topic column.',
    statementName: 'nodesShelvedAtColumn',
    tableName: 'nodes'
  },
  nodesManualChildOrder: {
    columnName: 'manual_child_order',
    errorMessage: 'Failed to add node manual child order column.',
    statementName: 'nodesManualChildOrderColumn',
    tableName: 'nodes'
  },
  nodeViewStateSource: {
    columnName: 'source',
    errorMessage: 'Failed to add node view state source column.',
    statementName: 'nodeViewStateSourceColumn',
    tableName: 'node_view_state'
  },
  syncBaseContentHash: {
    columnName: 'base_content_hash',
    errorMessage: 'Failed to add sync base content hash column.',
    statementName: 'syncObjectStateBaseContentHashColumn',
    tableName: 'sync_object_state'
  },
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
