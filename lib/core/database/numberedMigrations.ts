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
import { READWISE_SOURCE_SCHEMA_STATEMENTS } from './readwiseSourceSchemaStatements.js';

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
      for (const statement of READWISE_SOURCE_SCHEMA_STATEMENTS) {
        sqlite.exec(statement);
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
