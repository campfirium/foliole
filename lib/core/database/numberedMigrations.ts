import { CORE_INDEX_SCHEMA_STATEMENTS } from './coreIndexSchemaStatements.js';
import type { DatabaseMigrationTarget } from './migrationTypes.js';
import {
  migrateDeviceIdSettingKey,
  migrateNodeReadingDeviceState,
  migrateNodeViewStateDeviceScope
} from './numberedMigrationDeviceIdentity.js';
import {
  backfillTextBodyBlobData,
  backfillTextBodyBlobOwners
} from './numberedMigrationTextBodyBackfill.js';

export const NUMBERED_MIGRATION_BASE_VERSION = 28;

export interface NumberedSchemaMigration {
  migrate: (sqlite: DatabaseMigrationTarget) => void;
  version: number;
}

export const NUMBERED_SCHEMA_MIGRATIONS: NumberedSchemaMigration[] = [
  {
    version: 29,
    migrate: (sqlite) => {
      sqlite.exec(`CREATE TABLE IF NOT EXISTS content_blobs (
        hash TEXT PRIMARY KEY,
        storage_key TEXT NOT NULL,
        kind TEXT NOT NULL,
        mime_type TEXT,
        compression TEXT NOT NULL DEFAULT 'none',
        original_size_bytes INTEGER NOT NULL,
        stored_size_bytes INTEGER NOT NULL,
        original_sha256 TEXT NOT NULL,
        stored_sha256 TEXT NOT NULL,
        availability TEXT NOT NULL DEFAULT 'missing',
        source_device_id TEXT,
        created_at TEXT NOT NULL,
        cached_at TEXT,
        last_verified_at TEXT
      )`);
      sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_content_blobs_availability
        ON content_blobs (availability)`);
      sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_content_blobs_kind
        ON content_blobs (kind)`);
      addColumnIfMissing(sqlite, 'nodes', 'body_blob_hash', 'TEXT');
      addColumnIfMissing(sqlite, 'external_documents', 'body_blob_hash', 'TEXT');
      backfillTextBodyBlobOwners(sqlite);
    }
  },
  {
    version: 30,
    migrate: (sqlite) => {
      sqlite.exec(`CREATE TABLE IF NOT EXISTS content_blob_data (
        hash TEXT PRIMARY KEY REFERENCES content_blobs(hash) ON DELETE CASCADE,
        data BLOB NOT NULL
      )`);
      addColumnIfMissing(sqlite, 'nodes', 'body_blob_hash', 'TEXT');
      addColumnIfMissing(sqlite, 'external_documents', 'body_blob_hash', 'TEXT');
      backfillTextBodyBlobOwners(sqlite);
      backfillTextBodyBlobData(sqlite, {
        bodyHashColumn: 'body_blob_hash',
        contentColumn: 'content',
        tableName: 'nodes'
      });
      backfillTextBodyBlobData(sqlite, {
        bodyHashColumn: 'body_blob_hash',
        contentColumn: 'content',
        tableName: 'external_documents'
      });
    }
  },
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

function tableExists(sqlite: DatabaseMigrationTarget, tableName: string) {
  const row = sqlite
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .all(tableName)[0] as { name?: string } | undefined;
  return row?.name === tableName;
}

function addColumnIfMissing(sqlite: DatabaseMigrationTarget, tableName: string, columnName: string, columnSql: string) {
  if (!tableExists(sqlite, tableName)) return;
  const columns = sqlite.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>;
  if (columns.some((column) => column.name === columnName)) return;
  sqlite.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnSql}`);
}

function execOptionalIndex(sqlite: DatabaseMigrationTarget, statement: string) {
  try {
    sqlite.exec(statement);
  } catch (error) {
    if (error instanceof Error && /no such (table|column)/i.test(error.message)) {
      return;
    }
    throw error;
  }
}
