import { retireAttachmentManifest } from './attachmentManifestRetirementMigration.js';
import { EDITOR_OPERATION_HISTORY_SCHEMA_STATEMENTS } from './editorOperationHistorySchema.js';
import type { DatabaseMigrationTarget } from './migrationTypes.js';
import { migrateAuthorHostSnapshots } from './numberedMigrationAuthorHostSnapshots.js';
import { createDataMigrationStateTable } from './numberedMigrationDataState.js';
import { migrateDeliveryAuthorizations } from './numberedMigrationDeliveryAuthorizations.js';
import { addColumnIfMissing, tableExists } from './numberedMigrationHelpers.js';
import { migrateHostPermanentState } from './numberedMigrationHostPermanentState.js';
import { migrateOpaqueSyncRefs } from './numberedMigrationOpaqueSyncRefs.js';
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
import { migrateWatchedSourceIdentity } from './numberedMigrationWatchedSourceIdentity.js';
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
import { SYNC_DELIVERY_TRIGGER_STATEMENTS } from './syncDeliveryTriggerStatements.js';
import { SYNC_GROUP_SCHEMA_STATEMENTS } from './syncGroupSchemaStatements.js';

const SYNC_DELIVERY_TRIGGER_TARGETS = [
  'sync_object_state',
  'sync_object_state',
  'sync_group_devices',
  'review_log'
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
  { version: 100, migrate: migrateWatchedSourceIdentity }
];
