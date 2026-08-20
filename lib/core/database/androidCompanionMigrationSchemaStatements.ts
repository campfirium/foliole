import {
  ANDROID_COMPANION_CONVERGENCE_MIGRATION_REPAIR_RULES,
  ANDROID_COMPANION_CONVERGENCE_MIGRATION_STATEMENTS
} from './androidCompanionConvergenceMigrationDefinitions.js';
import {
  ANDROID_COMPANION_DESKTOP_SOURCE_MIGRATION_REPAIR_RULES,
  ANDROID_COMPANION_DESKTOP_SOURCE_MIGRATION_STATEMENTS
} from './androidCompanionDesktopSourceMigration.js';
import {
  ANDROID_COMPANION_EXTERNAL_FOLDER_OWNERSHIP_MIGRATION_STATEMENTS
} from './androidCompanionExternalFolderOwnershipMigration.js';
import {
  ANDROID_COMPANION_NODE_PROVENANCE_MIGRATION_REPAIR_RULES,
  ANDROID_COMPANION_NODE_PROVENANCE_MIGRATION_STATEMENTS
} from './androidCompanionNodeProvenanceMigration.js';
import {
  ANDROID_COMPANION_NODE_SCHEDULING_MIGRATION_REPAIR_RULES,
  ANDROID_COMPANION_NODE_SCHEDULING_MIGRATION_STATEMENTS
} from './androidCompanionNodeSchedulingMigration.js';
import { ANDROID_COMPANION_SYNC_STATE_MIGRATION_REPAIR_RULES } from './androidCompanionSyncStateMigrationRules.js';
import {
  ANDROID_COMPANION_WORKGROUP_KEY_MIGRATION_REPAIR_RULES,
  ANDROID_COMPANION_WORKGROUP_KEY_MIGRATION_STATEMENTS
} from './androidCompanionWorkgroupKeyMigration.js';
export {
  ANDROID_COMPANION_MIGRATION_ACTION_TYPES,
  ANDROID_COMPANION_MIGRATION_PLAN
} from './androidCompanionMigrationPlan.js';
export {
  ANDROID_COMPANION_MIGRATION_ACTION_KEYS,
  ANDROID_COMPANION_MIGRATION_ASSET_KEYS,
  ANDROID_COMPANION_MIGRATION_DEFAULT_MESSAGES,
  ANDROID_COMPANION_MIGRATION_PLAN_KEYS,
  ANDROID_COMPANION_MIGRATION_REPAIR_RULE_KEYS
} from './androidCompanionMigrationMetadata.js';

export const ANDROID_COMPANION_MIGRATION_SCHEMA_STATEMENTS = {
  ...ANDROID_COMPANION_CONVERGENCE_MIGRATION_STATEMENTS,
  ...ANDROID_COMPANION_NODE_PROVENANCE_MIGRATION_STATEMENTS,
  ...ANDROID_COMPANION_EXTERNAL_FOLDER_OWNERSHIP_MIGRATION_STATEMENTS,
  ...ANDROID_COMPANION_NODE_SCHEDULING_MIGRATION_STATEMENTS,
  ...ANDROID_COMPANION_WORKGROUP_KEY_MIGRATION_STATEMENTS,
  ...ANDROID_COMPANION_DESKTOP_SOURCE_MIGRATION_STATEMENTS,
  nodeViewStateSourceColumn: "ALTER TABLE node_view_state ADD COLUMN source TEXT NOT NULL DEFAULT 'user-scroll'",
  syncPushAckDropLegacyTable: 'DROP TABLE IF EXISTS sync_push_ack',
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

export const ANDROID_COMPANION_MIGRATION_REPAIR_RULES = {
  ...ANDROID_COMPANION_CONVERGENCE_MIGRATION_REPAIR_RULES,
  ...ANDROID_COMPANION_SYNC_STATE_MIGRATION_REPAIR_RULES,
  ...ANDROID_COMPANION_NODE_PROVENANCE_MIGRATION_REPAIR_RULES,
  ...ANDROID_COMPANION_NODE_SCHEDULING_MIGRATION_REPAIR_RULES,
  ...ANDROID_COMPANION_WORKGROUP_KEY_MIGRATION_REPAIR_RULES,
  ...ANDROID_COMPANION_DESKTOP_SOURCE_MIGRATION_REPAIR_RULES,
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
} as const;
