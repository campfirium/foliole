import { retireAttachmentManifest } from './attachmentManifestRetirementMigration.js';
import { retireAttachmentRegistry } from './attachmentRegistryRetirement.js';
import { migrateDynamicNodeVersionChains } from './dynamicNodeVersionChainMigration.js';
import { EDITOR_OPERATION_HISTORY_SCHEMA_STATEMENTS } from './editorOperationHistorySchema.js';
import { FOREGROUND_TIME_SCHEMA } from './foregroundTimeSchema.js';
import { migrateIndependentNodeVersions } from './independentNodeVersionMigration.js';
import { initializeLegacyBodyMigrationSchema } from './legacyBodyMigrationSchema.js';
import { retireLegacyStorage } from './legacyStorageRetirementMigration.js';
import type { DatabaseMigrationTarget } from './migrationTypes.js';
import { migrateNodeVersionConfirmations } from './nodeVersionConfirmationMigration.js';
import { NODE_VERSION_MEMBER_POSITION_SCHEMA } from './nodeVersionMemberPositionSchema.js';
import { NODE_VERSION_RETENTION_INDEX_SCHEMA } from './nodeVersionRetentionIndexSchema.js';
import { NODE_VERSION_RETENTION_SCHEMA_STATEMENTS } from './nodeVersionRetentionSchemaStatements.js';
import { migrateAuthorHostSnapshots } from './numberedMigrationAuthorHostSnapshots.js';
import { createDataMigrationStateTable } from './numberedMigrationDataState.js';
import { migrateDeliveryAuthorizations } from './numberedMigrationDeliveryAuthorizations.js';
import { addColumnIfMissing, tableExists } from './numberedMigrationHelpers.js';
import { migrateHostPermanentState } from './numberedMigrationHostPermanentState.js';
import { migrateOpaqueSyncRefs } from './numberedMigrationOpaqueSyncRefs.js';
import { migrateParentChildOrder } from './numberedMigrationParentChildOrder.js';
import { retirePrimaryDeviceState } from './numberedMigrationPrimaryDeviceRetirement.js';
import { reopenReadwiseBoundOriginalFiles } from './numberedMigrationReadwiseBoundOriginalFiles.js';
import { reopenIncompleteReadwiseCompletion } from './numberedMigrationReadwiseCompletionRepair.js';
import { migrateReadwiseHostSettings } from './numberedMigrationReadwiseHostSettings.js';
import type { NumberedSchemaMigration } from './numberedMigrations.js';
import { migrateSinglePrincipalSyncGroup } from './numberedMigrationSinglePrincipalSyncGroup.js';
import { migrateSourceHostOwnership } from './numberedMigrationSourceHostOwnership.js';
import { migrateSyncGroupHosts } from './numberedMigrationSyncGroupHosts.js';
import { repairSyncObjectStateBaseContentHash } from './numberedMigrationSyncStateBaseHash.js';
import { migrateWatchedDeviceBindings } from './numberedMigrationWatchedDeviceBindings.js';
import {
  addWatchedFolderConflictSourceRefs,
  addWatchedFolderConflictReconciliation,
  createWatchedFolderConflictDecisions
} from './numberedMigrationWatchedFolderConflicts.js';
import { migrateWatchedSourceIdentity } from './numberedMigrationWatchedSourceIdentity.js';
import { recoverWatchedSourcesAndPaths } from './numberedMigrationWatchedSourceRecovery.js';
import { migrateParentOrderVersions } from './parentOrderVersionMigration.js';
import { migrateReadwiseApiImport } from './readwiseApiImportMigration.js';
import { migrateReadwiseApiReconcile } from './readwiseApiReconcileMigration.js';
import { migrateReadwiseAutoImportPolicy } from './readwiseAutoImportPolicyMigration.js';
import { migrateReadwiseExternalReferences } from './readwiseExternalReferenceMigration.js';
import { migrateReadwiseHostSettingsVersion } from './readwiseHostSettingsVersionMigration.js';
import { migrateReadwiseRemoteIdentity } from './readwiseRemoteIdentityMigration.js';
import { migrateReadwiseSevenCategoryPolicy } from './readwiseSevenCategoryPolicyMigration.js';
import {
  invalidateLegacyReadwiseSourceCompletion,
  migrateReadwiseSourceMode
} from './readwiseSourceModeMigration.js';
import { REVIEW_DAILY_COUNT_SCHEMA } from './reviewDailyCountSchema.js';
import { initializeStoredSourceSearch } from './storedSourceSearchSchema.js';
import { SYNC_DELIVERY_TRIGGER_STATEMENTS } from './syncDeliveryTriggerStatements.js';
import { SYNC_GROUP_RESTORE_SCHEMA_STATEMENTS } from './syncGroupRestoreSchemaStatements.js';
import { SYNC_GROUP_SCHEMA_STATEMENTS } from './syncGroupSchemaStatements.js';
import { SYNC_IDENTITY_ENTITY_TRIGGER_STATEMENTS,
  SYNC_IDENTITY_ENTITY_TRIGGER_STATEMENTS_V129 } from './syncIdentityEntityTriggerStatements.js';
import { SYNC_IDENTITY_FACT_STAGING_SCHEMA } from './syncIdentityFactStagingSchema.js';
import { SYNC_IDENTITY_INDEX_SCHEMA_STATEMENTS } from './syncIdentityIndexSchemaStatements.js';
import { SYNC_IDENTITY_RECEIPT_SCHEMA_STATEMENTS } from './syncIdentityReceiptSchemaStatements.js';
import { SYNC_PACK_DEPENDENCY_STAGING_SCHEMA } from './syncPackDependencyStagingSchema.js';
import { SYNC_PACK_PROGRESS_SCHEMA_STATEMENTS } from './syncPackProgressSchemaStatements.js';
import { repairSyncStateEntities } from './syncStateEntityRepair.js';
import { SYNC_STATE_SEQUENCE_SCHEMA_STATEMENTS } from './syncStateSequenceSchemaStatements.js';
import { removeUntrackedImportCaches } from './untrackedImportCacheMigration.js';

const SYNC_DELIVERY_TRIGGER_TARGETS = [
  'sync_object_state',
  'sync_object_state',
  'sync_group_devices',
  'review_log',
  'sync_object_state',
  'sync_object_state',
  'sync_object_state'
] as const;

function installAvailableSyncDeliveryTriggers(sqlite: DatabaseMigrationTarget) {
  SYNC_DELIVERY_TRIGGER_STATEMENTS.forEach((statement, index) => {
    if (tableExists(sqlite, SYNC_DELIVERY_TRIGGER_TARGETS[index]!)) sqlite.exec(statement);
  });
}

export const LATEST_NUMBERED_SCHEMA_MIGRATIONS: NumberedSchemaMigration[] = [
  { version: 70, migrate: migrateHostPermanentState },
  { version: 71, migrate: migrateOpaqueSyncRefs },
  { version: 72, migrate: migrateAuthorHostSnapshots },
  { version: 73, migrate: migrateSyncGroupHosts },
  { version: 74, migrate: migrateDeliveryAuthorizations },
  { version: 75, migrate: retirePrimaryDeviceState },
  { version: 76, migrate: migrateSourceHostOwnership },
  { version: 77, migrate: migrateReadwiseHostSettings },
  { version: 78, migrate: migrateSinglePrincipalSyncGroup },
  { version: 79, migrate: migrateReadwiseHostSettingsVersion },
  { version: 80, migrate: migrateReadwiseRemoteIdentity },
  { version: 81, migrate: migrateReadwiseApiImport },
  { version: 82, migrate: migrateReadwiseExternalReferences },
  { version: 83, migrate: migrateReadwiseApiReconcile },
  { version: 84, migrate: migrateReadwiseAutoImportPolicy },
  { version: 85, migrate: migrateReadwiseSevenCategoryPolicy },
  { version: 86, migrate: migrateReadwiseAutoImportPolicy },
  { version: 87, migrate: createDataMigrationStateTable },
  { version: 88, migrate: migrateReadwiseSourceMode },
  { version: 89, migrate: repairSyncObjectStateBaseContentHash },
  { version: 90, migrate: invalidateLegacyReadwiseSourceCompletion },
  {
    version: 91,
    migrate: (sqlite) => {
      for (const statement of SYNC_GROUP_SCHEMA_STATEMENTS.slice(-3)) sqlite.exec(statement);
      for (const name of ['trg_sync_delivery_state_insert', 'trg_sync_delivery_state_update',
        'trg_sync_delivery_review_insert']) sqlite.exec(`DROP TRIGGER IF EXISTS ${name}`);
      installAvailableSyncDeliveryTriggers(sqlite);
    }
  },
  { version: 92, migrate: reopenReadwiseBoundOriginalFiles },
  { version: 93, migrate: reopenIncompleteReadwiseCompletion },
  { version: 94, migrate: reopenIncompleteReadwiseCompletion },
  { version: 95, migrate: reopenIncompleteReadwiseCompletion },
  {
    version: 96,
    migrate: (sqlite) => {
      for (const statement of EDITOR_OPERATION_HISTORY_SCHEMA_STATEMENTS) sqlite.exec(statement);
    }
  },
  { version: 97, migrate: (sqlite) => addColumnIfMissing(sqlite, 'nodes', 'image_sources', 'TEXT') },
  { version: 98, migrate: retireAttachmentManifest },
  { version: 99, migrate: migrateWatchedDeviceBindings },
  { version: 100, migrate: migrateWatchedSourceIdentity },
  { version: 101, migrate: recoverWatchedSourcesAndPaths },
  { version: 102, migrate: createWatchedFolderConflictDecisions },
  { version: 103, migrate: addWatchedFolderConflictReconciliation },
  { version: 104, migrate: addWatchedFolderConflictSourceRefs },
  { version: 105, migrate: migrateParentChildOrder },
  { version: 106, migrate: (sqlite) => {
    for (const statement of NODE_VERSION_RETENTION_SCHEMA_STATEMENTS) sqlite.exec(statement);
  } },
  { version: 107, migrate: (sqlite) => {
    for (const statement of SYNC_GROUP_RESTORE_SCHEMA_STATEMENTS) sqlite.exec(statement);
  } },
  { version: 108, migrate: (sqlite) => {
    for (const statement of [
      ...SYNC_STATE_SEQUENCE_SCHEMA_STATEMENTS, ...SYNC_PACK_PROGRESS_SCHEMA_STATEMENTS
    ]) sqlite.exec(statement);
  } },
  { version: 109, migrate: (sqlite) => {
    sqlite.exec(SYNC_PACK_PROGRESS_SCHEMA_STATEMENTS[1]);
  } },
  // Reserved: this development migration was withdrawn; existing databases keep their version.
  { version: 110, migrate: () => {} },
  { version: 111, migrate: (sqlite) => {
    sqlite.exec(SYNC_PACK_PROGRESS_SCHEMA_STATEMENTS[2]);
  } },
  // Reserved: this development migration was withdrawn; existing databases keep their version.
  { version: 112, migrate: () => {} },
  // Reserved: this development migration was withdrawn; existing databases keep their version.
  { version: 113, migrate: () => {} },
  { version: 114, migrate: (sqlite) => {
    for (const statement of SYNC_PACK_DEPENDENCY_STAGING_SCHEMA) sqlite.exec(statement);
  } },
  { version: 115, migrate: (sqlite) => {
    sqlite.exec(SYNC_PACK_DEPENDENCY_STAGING_SCHEMA[2]);
  } },
  { version: 116, migrate: (sqlite) => {
    sqlite.exec(SYNC_PACK_DEPENDENCY_STAGING_SCHEMA[3]);
  } },
  { version: 117, migrate: (sqlite) => {
    sqlite.exec(SYNC_GROUP_RESTORE_SCHEMA_STATEMENTS[2]);
  } },
  { version: 118, migrate: (sqlite) => {
    sqlite.exec(SYNC_PACK_PROGRESS_SCHEMA_STATEMENTS[3]);
  } },
  { version: 119, migrate: retireAttachmentRegistry },
  { version: 120, migrate: (sqlite) => {
    for (const statement of NODE_VERSION_RETENTION_SCHEMA_STATEMENTS) sqlite.exec(statement);
    migrateDynamicNodeVersionChains(sqlite);
  } },
  { version: 121, migrate: repairSyncStateEntities },
  { version: 122, migrate: migrateIndependentNodeVersions },
  { version: 123, migrate: initializeStoredSourceSearch },
  { version: 124, migrate: initializeLegacyBodyMigrationSchema },
  { version: 125, migrate: (sqlite) => {
    for (const statement of REVIEW_DAILY_COUNT_SCHEMA) sqlite.exec(statement);
  } },
  { version: 126, migrate: migrateNodeVersionConfirmations },
  { version: 127, migrate: removeUntrackedImportCaches },
  { version: 128, migrate: retireLegacyStorage },
  { version: 129, migrate: (sqlite) => {
    for (const statement of SYNC_IDENTITY_INDEX_SCHEMA_STATEMENTS) sqlite.exec(statement);
    for (const statement of SYNC_IDENTITY_RECEIPT_SCHEMA_STATEMENTS) sqlite.exec(statement);
    for (const statement of SYNC_IDENTITY_ENTITY_TRIGGER_STATEMENTS_V129) sqlite.exec(statement);
  } },
  { version: 130, migrate: (sqlite) => {
    for (const column of ['local_proof_root', 'peer_proof_root',
      'proof_contract_revision']) {
      addColumnIfMissing(sqlite, 'sync_identity_peer_baselines', column,
        "TEXT NOT NULL DEFAULT ''");
    }
  } },
  { version: 131, migrate: migrateParentOrderVersions },
  { version: 132, migrate: (sqlite) => {
    for (const statement of NODE_VERSION_MEMBER_POSITION_SCHEMA) sqlite.exec(statement);
  } },
  { version: 133, migrate: (sqlite) => {
    for (const statement of SYNC_IDENTITY_FACT_STAGING_SCHEMA) sqlite.exec(statement);
  } },
  { version: 134, migrate: (sqlite) => {
    for (const statement of FOREGROUND_TIME_SCHEMA) sqlite.exec(statement);
    for (const statement of SYNC_IDENTITY_ENTITY_TRIGGER_STATEMENTS) sqlite.exec(statement);
  } },
  { version: 135, migrate: (sqlite) => {
    for (const statement of NODE_VERSION_RETENTION_INDEX_SCHEMA) sqlite.exec(statement);
  } }
];
