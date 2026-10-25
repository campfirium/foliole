import { migrateAttachmentDemands } from './attachmentDemandSchema.js';
import { retireAttachmentInventory } from './attachmentInventoryRetirementMigration.js';
import { migrateCurrentParentOrders } from './currentParentOrderMigration.js';
import { migrateExternalFolderDisplayPaths } from './externalFolderDisplayPathMigration.js';
import { migrateForegroundSources, retireForegroundIdentityTriggers } from './foregroundSourceMigration.js';
import { INVALIDATE_ALL_SYNC_DIGESTS, INVALIDATE_UNREADY_SYNC_DIGESTS, migrateFramedSyncDigests } from './framedSyncDigestSchema.js';
import { migrateFramedSyncInventoryLookups } from './framedSyncInventoryLookupMigration.js';
import { retireLegacySyncState } from './legacySyncRetirement.js';
import { migrateMissingCurrentVersionInventory } from './missingCurrentVersionInventoryMigration.js';
import { migrateNodeChildInventory } from './nodeChildInventoryMigration.js';
import { migrateNodeHistoryState } from './nodeHistoryStateMigration.js';
import { retireNodePositions } from './nodePositionRetirementMigration.js';
import { addColumnIfMissing } from './numberedMigrationHelpers.js';
import type { NumberedSchemaMigration } from './numberedMigrations.js';
import { migrateParentChildOrderMembers } from './parentChildOrderMembers.js';
import { migratePdfTextArtifacts } from './pdfTextArtifactMigration.js';
import { migrateTextBodyOwnership } from './textBodyOwnershipMigration.js';
import { migrateTopicHistoryRetirement } from './topicHistoryRetirementMigration.js';

export const SYNC_MODEL_SCHEMA_MIGRATIONS: NumberedSchemaMigration[] = [
  { version: 150, migrate: migrateTextBodyOwnership },
  { version: 151, migrate: migrateNodeHistoryState },
  { version: 152, migrate: migrateCurrentParentOrders },
  { version: 153, migrate: retireLegacySyncState },
  { version: 154, migrate: migrateTopicHistoryRetirement },
  { version: 155, migrate: retireNodePositions },
  { version: 156, migrate: migrateNodeChildInventory },
  { version: 157, migrate: migrateFramedSyncDigests },
  { version: 158, migrate: migrateForegroundSources },
  { version: 159, migrate: migratePdfTextArtifacts },
  { version: 160, migrate: retireForegroundIdentityTriggers },
  { version: 161, migrate: migrateMissingCurrentVersionInventory },
  { version: 162, migrate: db => { db.exec(INVALIDATE_UNREADY_SYNC_DIGESTS); } },
  { version: 163, migrate: db => addColumnIfMissing(db,
    'node_version_local_origins', 'content_edit_image_input_hash', 'TEXT') },
  { version: 164, migrate: migrateAttachmentDemands },
  { version: 165, migrate: migrateExternalFolderDisplayPaths },
  { version: 166, migrate: migrateMissingCurrentVersionInventory },
  { version: 167, migrate: db => { db.exec(INVALIDATE_ALL_SYNC_DIGESTS); } },
  { version: 168, migrate: migrateFramedSyncInventoryLookups },
  { version: 169, migrate: migrateParentChildOrderMembers },
  /** Reinstalls the inventory triggers without the ones on `nodes`. */
  { version: 170, migrate: migrateFramedSyncInventoryLookups },
  { version: 171, migrate: retireAttachmentInventory }
];
