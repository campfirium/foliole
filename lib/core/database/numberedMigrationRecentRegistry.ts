import {
  ASSISTANT_THREAD_INDEX_SCHEMA_STATEMENTS,
  ASSISTANT_THREAD_MESSAGE_SCHEMA_STATEMENTS
} from './assistantThreadIndexSchemaStatements.js';
import { LEGACY_DEVICE_SYNC_GROUP_SCHEMA_STATEMENTS } from './legacyDeviceSyncGroupSchemaStatements.js';
import { migrateAuthorHostSnapshots } from './numberedMigrationAuthorHostSnapshots.js';
import { migrateDeliveryAuthorizations } from './numberedMigrationDeliveryAuthorizations.js';
import { migrateDesktopSourceConnections } from './numberedMigrationDesktopSourceConnections.js';
import { migrateDesktopSourceOwnership } from './numberedMigrationDesktopSourceOwnership.js';
import { migrateDesktopSources } from './numberedMigrationDesktopSources.js';
import { migrateExternalFolderOwnership } from './numberedMigrationExternalFolderOwnership.js';
import { addColumnIfMissing } from './numberedMigrationHelpers.js';
import { migrateHostPermanentState } from './numberedMigrationHostPermanentState.js';
import { createIncomingUpdatesTable } from './numberedMigrationIncomingUpdates.js';
import { migrateLocalFilesRegistry, resetOpenedLocalFileHistory } from './numberedMigrationLocalFiles.js';
import { migrateLegacyVirtualFoldersToManualNodes } from './numberedMigrationManualVirtualFolders.js';
import { migrateNodeProvenance } from './numberedMigrationNodeProvenance.js';
import { createNodeSyncTombstoneTable } from './numberedMigrationNodeSyncTombstones.js';
import { migrateOpaqueSyncRefs } from './numberedMigrationOpaqueSyncRefs.js';
import { retirePrimaryDeviceState } from './numberedMigrationPrimaryDeviceRetirement.js';
import { migrateReadwiseHostSettings } from './numberedMigrationReadwiseHostSettings.js';
import type { NumberedSchemaMigration } from './numberedMigrations.js';
import { migrateSettingSingleTruth } from './numberedMigrationSettingSingleTruth.js';
import { migrateSinglePrincipalSyncGroup } from './numberedMigrationSinglePrincipalSyncGroup.js';
import { migrateSourceHostOwnership } from './numberedMigrationSourceHostOwnership.js';
import { migrateSyncConflictConvergence } from './numberedMigrationSyncConvergence.js';
import { migrateSyncDeliveryReceipts } from './numberedMigrationSyncDelivery.js';
import { migrateSyncGroupDepartures } from './numberedMigrationSyncGroupDepartures.js';
import { migrateSyncGroupHosts } from './numberedMigrationSyncGroupHosts.js';
import { createVirtualFolderTables } from './numberedMigrationVirtualFolders.js';
import { SYNC_GROUP_SCHEMA_STATEMENTS } from './syncGroupSchemaStatements.js';

export const RECENT_NUMBERED_SCHEMA_MIGRATIONS: NumberedSchemaMigration[] = [
  {
    version: 43,
    migrate: (sqlite) => {
      addColumnIfMissing(sqlite, 'nodes', 'enable_short_term', 'INTEGER');
    }
  },
  {
    version: 44,
    migrate: (sqlite) => {
      addColumnIfMissing(sqlite, 'nodes', 'sequential_reading_enabled', 'INTEGER');
    }
  },
  {
    version: 45,
    migrate: (sqlite) => {
      addColumnIfMissing(sqlite, 'nodes', 'manual_child_order', 'TEXT');
    }
  },
  {
    version: 46,
    migrate: (sqlite) => {
      addColumnIfMissing(sqlite, 'nodes', 'shelved_at', 'TEXT');
    }
  },
  {
    version: 47,
    migrate: migrateLocalFilesRegistry
  },
  {
    version: 48,
    migrate: resetOpenedLocalFileHistory
  },
  {
    version: 49,
    migrate: createIncomingUpdatesTable
  },
  {
    version: 50,
    migrate: createVirtualFolderTables
  },
  {
    version: 51,
    migrate: (sqlite) => {
      for (const statement of ASSISTANT_THREAD_INDEX_SCHEMA_STATEMENTS) {
        sqlite.exec(statement);
      }
    }
  },
  {
    version: 52,
    migrate: createNodeSyncTombstoneTable
  },
  {
    version: 53,
    migrate: (sqlite) => {
      for (const statement of ASSISTANT_THREAD_MESSAGE_SCHEMA_STATEMENTS) {
        sqlite.exec(statement);
      }
    }
  },
  {
    version: 54,
    migrate: migrateSettingSingleTruth
  },
  {
    version: 55,
    migrate: migrateNodeProvenance
  },
  {
    version: 56,
    migrate: migrateLegacyVirtualFoldersToManualNodes
  },
  {
    version: 57,
    migrate: (sqlite) => {
      addColumnIfMissing(sqlite, 'assistant_thread_index', 'agent_tool_version', 'INTEGER NOT NULL DEFAULT 0');
      addColumnIfMissing(sqlite, 'assistant_thread_index', 'continued_from_thread_id', 'TEXT');
    }
  },
  {
    version: 58,
    migrate: (sqlite) => {
      sqlite.exec('DROP TABLE IF EXISTS assistant_thread_messages');
      sqlite.exec('DROP TABLE IF EXISTS assistant_thread_index');
    }
  },
  {
    version: 59,
    migrate: (sqlite) => {
      sqlite.exec('DROP TABLE IF EXISTS assistant_thread_message_images');
      sqlite.exec('DROP TABLE IF EXISTS assistant_image_attachments');
      sqlite.exec('DROP TABLE IF EXISTS assistant_thread_messages');
      sqlite.exec('DROP TABLE IF EXISTS assistant_thread_index');
    }
  },
  {
    version: 60,
    migrate: (sqlite) => {
      sqlite.exec(`CREATE TABLE IF NOT EXISTS node_open_state (
        node_id TEXT PRIMARY KEY REFERENCES nodes(id) ON DELETE CASCADE,
        last_opened_at TEXT NOT NULL
      )`);
    }
  },
  {
    version: 61,
    migrate: migrateExternalFolderOwnership
  },
  {
    version: 62,
    migrate: migrateSyncConflictConvergence
  },
  {
    version: 63,
    migrate: (sqlite) => {
      for (const statement of LEGACY_DEVICE_SYNC_GROUP_SCHEMA_STATEMENTS) sqlite.exec(statement);
    }
  },
  {
    version: 64,
    migrate: migrateSyncDeliveryReceipts
  },
  {
    version: 65,
    migrate: migrateSyncGroupDepartures
  },
  {
    version: 66,
    migrate: (sqlite) => {
      addColumnIfMissing(sqlite, 'sync_groups', 'workgroup_key', 'TEXT');
      for (const statement of SYNC_GROUP_SCHEMA_STATEMENTS) sqlite.exec(statement);
    }
  },
  {
    version: 67,
    migrate: migrateDesktopSourceConnections
  },
  {
    version: 68,
    migrate: migrateDesktopSources
  },
  {
    version: 69,
    migrate: migrateDesktopSourceOwnership
  },
  {
    version: 70,
    migrate: migrateHostPermanentState
  },
  {
    version: 71,
    migrate: migrateOpaqueSyncRefs
  },
  {
    version: 72,
    migrate: migrateAuthorHostSnapshots
  },
  {
    version: 73,
    migrate: migrateSyncGroupHosts
  },
  {
    version: 74,
    migrate: migrateDeliveryAuthorizations
  },
  {
    version: 75,
    migrate: retirePrimaryDeviceState
  },
  {
    version: 76,
    migrate: migrateSourceHostOwnership
  },
  {
    version: 77,
    migrate: migrateReadwiseHostSettings
  },
  {
    version: 78,
    migrate: migrateSinglePrincipalSyncGroup
  }
];
