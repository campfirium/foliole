import { migrateAuthorHostSnapshots } from './numberedMigrationAuthorHostSnapshots.js';
import { migrateDeliveryAuthorizations } from './numberedMigrationDeliveryAuthorizations.js';
import { migrateHostPermanentState } from './numberedMigrationHostPermanentState.js';
import { migrateOpaqueSyncRefs } from './numberedMigrationOpaqueSyncRefs.js';
import { retirePrimaryDeviceState } from './numberedMigrationPrimaryDeviceRetirement.js';
import { migrateReadwiseHostSettings } from './numberedMigrationReadwiseHostSettings.js';
import type { NumberedSchemaMigration } from './numberedMigrations.js';
import { migrateSinglePrincipalSyncGroup } from './numberedMigrationSinglePrincipalSyncGroup.js';
import { migrateSourceHostOwnership } from './numberedMigrationSourceHostOwnership.js';
import { migrateSyncGroupHosts } from './numberedMigrationSyncGroupHosts.js';
import { migrateReadwiseApiImport } from './readwiseApiImportMigration.js';
import { migrateReadwiseApiReconcile } from './readwiseApiReconcileMigration.js';
import { migrateReadwiseAutoImportPolicy } from './readwiseAutoImportPolicyMigration.js';
import { migrateReadwiseExternalReferences } from './readwiseExternalReferenceMigration.js';
import { migrateReadwiseHostSettingsVersion } from './readwiseHostSettingsVersionMigration.js';
import { migrateReadwiseRemoteIdentity } from './readwiseRemoteIdentityMigration.js';
import { migrateReadwiseSevenCategoryPolicy } from './readwiseSevenCategoryPolicyMigration.js';

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
  { version: 85, migrate: migrateReadwiseSevenCategoryPolicy }
];
