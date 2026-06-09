import { CORE_INDEX_SCHEMA_STATEMENTS } from './coreIndexSchemaStatements.js';
import type { DatabaseMigrationTarget } from './migrationTypes.js';
import {
  migrateDeviceIdSettingKey,
  migrateNodeReadingDeviceState,
  migrateNodeViewStateDeviceScope
} from './numberedMigrationDeviceIdentity.js';
import { addColumnIfMissing, execOptionalIndex, tableExists } from './numberedMigrationHelpers.js';
import { migrateLocalFilesRegistry } from './numberedMigrationLocalFiles.js';
import { TEXT_BODY_NUMBERED_MIGRATIONS } from './numberedMigrationTextBodyRegistry.js';
import { migrateSearchIndexInvalidationTypes } from './searchIndexInvalidationSchemaMigration.js';
import { SEARCH_INDEX_INVALIDATION_SCHEMA_STATEMENTS } from './searchIndexInvalidationSchemaStatements.js';
import { SOURCE_DISPOSITION_SCHEMA_STATEMENTS } from './sourceDispositionSchemaStatements.js';

export const NUMBERED_MIGRATION_BASE_VERSION = 28;

export interface NumberedSchemaMigration {
  migrate: (sqlite: DatabaseMigrationTarget) => void;
  version: number;
}

export const NUMBERED_SCHEMA_MIGRATIONS: NumberedSchemaMigration[] = [
  ...TEXT_BODY_NUMBERED_MIGRATIONS,
  {
    version: 31,
    migrate: (sqlite) => {
      migrateNodeViewStateDeviceScope(sqlite);
    }
  },
  {
    version: 32,
    migrate: (sqlite) => {
      migrateNodeReadingDeviceState(sqlite);
    }
  },
  {
    version: 33,
    migrate: (sqlite) => {
      addColumnIfMissing(sqlite, 'node_view_state', 'source', "TEXT NOT NULL DEFAULT 'user-scroll'");
    }
  },
  {
    version: 34,
    migrate: (sqlite) => {
      migrateDeviceIdSettingKey(sqlite);
    }
  },
  {
    version: 35,
    migrate: (sqlite) => {
      addColumnIfMissing(sqlite, 'sync_peers', 'primary_device_epoch', 'INTEGER');
      addColumnIfMissing(sqlite, 'sync_peers', 'primary_committed_at', 'TEXT');
      addColumnIfMissing(sqlite, 'sync_peers', 'primary_updated_by_device_id', 'TEXT');
    }
  },
  {
    version: 36,
    migrate: (sqlite) => {
      if (!tableExists(sqlite, 'keep_import_items')) {
        return;
      }
      addColumnIfMissing(sqlite, 'keep_import_items', 'source_state', "TEXT NOT NULL DEFAULT 'present'");
      addColumnIfMissing(sqlite, 'keep_import_items', 'local_node_state', "TEXT NOT NULL DEFAULT 'not_imported'");
      sqlite.exec(
        `UPDATE keep_import_items
         SET local_node_state = CASE
           WHEN last_node_id IS NULL THEN 'not_imported'
           WHEN EXISTS (SELECT 1 FROM nodes WHERE nodes.id = keep_import_items.last_node_id AND nodes.deleted_at IS NULL) THEN 'active'
           ELSE 'locally_deleted'
         END`
      );
    }
  },
  {
    version: 37,
    migrate: (sqlite) => {
      if (!tableExists(sqlite, 'keep_import_items')) {
        return;
      }
      addColumnIfMissing(sqlite, 'keep_import_items', 'deleted_at', 'TEXT');
      sqlite.exec(
        `UPDATE keep_import_items
         SET deleted_at = last_seen_at
         WHERE deleted_at IS NULL
           AND source_state = 'present'
           AND local_node_state = 'locally_deleted'
          AND last_status = 'blocked_deleted'`
      );
    }
  },
  {
    version: 38,
    migrate: (sqlite) => {
      sqlite.exec(`CREATE TABLE IF NOT EXISTS keep_import_item_cache (
        rule_id TEXT NOT NULL,
        source_path TEXT NOT NULL,
        title TEXT NOT NULL,
        content TEXT,
        content_preview TEXT,
        source_mtime_ms INTEGER NOT NULL,
        source_size_bytes INTEGER NOT NULL,
        refreshed_at TEXT NOT NULL,
        refresh_error TEXT,
        PRIMARY KEY (rule_id, source_path)
      )`);
    }
  },
  {
    version: 39,
    migrate: (sqlite) => {
      for (const statement of CORE_INDEX_SCHEMA_STATEMENTS) {
        execOptionalIndex(sqlite, statement);
      }
    }
  },
  {
    version: 40,
    migrate: (sqlite) => {
      for (const statement of SEARCH_INDEX_INVALIDATION_SCHEMA_STATEMENTS) {
        sqlite.exec(statement);
      }
    }
  },
  {
    version: 41,
    migrate: migrateSearchIndexInvalidationTypes
  },
  {
    version: 42,
    migrate: (sqlite) => {
      for (const statement of SOURCE_DISPOSITION_SCHEMA_STATEMENTS) {
        sqlite.exec(statement);
      }
    }
  },
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
  }
];

export function resolveNumberedSchemaMigrations(args: {
  currentVersion: number;
  legacyMessage: string;
  migrations?: NumberedSchemaMigration[];
  targetVersion: number;
}): NumberedSchemaMigration[] {
  if (args.currentVersion < NUMBERED_MIGRATION_BASE_VERSION) {
    throw new Error(args.legacyMessage);
  }
  if (args.currentVersion > args.targetVersion) {
    throw new Error(`database schema version ${args.currentVersion} is newer than supported`);
  }

  const migrationsByVersion = indexMigrations(args.migrations ?? NUMBERED_SCHEMA_MIGRATIONS);
  const pendingMigrations: NumberedSchemaMigration[] = [];
  for (let version = args.currentVersion + 1; version <= args.targetVersion; version += 1) {
    const migration = migrationsByVersion.get(version);
    if (!migration) {
      throw new Error(`missing database schema migration for version ${version}`);
    }
    pendingMigrations.push(migration);
  }
  return pendingMigrations;
}

export function applyNumberedSchemaMigrations(args: {
  currentVersion: number;
  legacyMessage: string;
  migrations?: NumberedSchemaMigration[];
  setUserVersion: (version: number) => void;
  sqlite: DatabaseMigrationTarget;
  targetVersion: number;
}) {
  const migrations = resolveNumberedSchemaMigrations(args);
  for (const migration of migrations) {
    migration.migrate(args.sqlite);
    args.setUserVersion(migration.version);
  }
}

function indexMigrations(migrations: NumberedSchemaMigration[]) {
  const migrationsByVersion = new Map<number, NumberedSchemaMigration>();
  for (const migration of migrations) {
    if (migrationsByVersion.has(migration.version)) {
      throw new Error(`duplicate database schema migration registered for version ${migration.version}`);
    }
    migrationsByVersion.set(migration.version, migration);
  }
  return migrationsByVersion;
}
