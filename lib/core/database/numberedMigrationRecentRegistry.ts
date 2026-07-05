import { addColumnIfMissing } from './numberedMigrationHelpers.js';
import { createIncomingUpdatesTable } from './numberedMigrationIncomingUpdates.js';
import { migrateLocalFilesRegistry, resetOpenedLocalFileHistory } from './numberedMigrationLocalFiles.js';
import type { NumberedSchemaMigration } from './numberedMigrations.js';
import { createVirtualFolderTables } from './numberedMigrationVirtualFolders.js';

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
  }
];
