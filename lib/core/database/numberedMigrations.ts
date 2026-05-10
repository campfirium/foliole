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
import {
  DOCUMENT_SOURCE_SCHEMA_STATEMENTS,
  IMPORT_SOURCES_COMPAT_VIEW_STATEMENTS
} from './documentSourceSchemaStatements.js';
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
  },
  {
    version: 37,
    migrate: (sqlite) => {
      migrateImportSourcesToDocumentSources(sqlite);
    }
  },
  {
    version: 38,
    migrate: (sqlite) => {
      addColumnIfMissing(sqlite, 'readwise_sources', 'account_id', "TEXT NOT NULL DEFAULT 'default'");
      sqlite.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_readwise_sources_account_reader_document
        ON readwise_sources (account_id, reader_document_id)`);
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

function migrateImportSourcesToDocumentSources(sqlite: DatabaseMigrationTarget) {
  for (const statement of DOCUMENT_SOURCE_SCHEMA_STATEMENTS) {
    sqlite.exec(statement);
  }
  if (tableExists(sqlite, 'import_sources')) {
    sqlite.exec(`INSERT INTO document_sources (
      source_id, provider, provider_document_id, source_kind, source_name, source_locator,
      source_fingerprint, content_fingerprint, presentation_state, availability_state, sync_status,
      internal_node_id, internalized_at, title, first_seen_at, last_seen_at, created_at, updated_at
    )
    SELECT
      source_fingerprint, provider, source_fingerprint, source_kind, source_name, source_locator,
      source_fingerprint, last_content_fingerprint,
      CASE WHEN latest_node_id IS NULL THEN 'external' ELSE 'internal' END,
      'available', 'synced', latest_node_id,
      CASE WHEN latest_node_id IS NULL THEN NULL ELSE last_imported_at END,
      source_name, first_imported_at, last_imported_at, first_imported_at, last_imported_at
    FROM import_sources`);
    sqlite.exec('DROP TABLE import_sources');
  }
  for (const statement of IMPORT_SOURCES_COMPAT_VIEW_STATEMENTS) {
    sqlite.exec(statement);
  }
  rewriteSyncObjectType(sqlite, 'import_source', 'document_source');
}

function rewriteSyncObjectType(sqlite: DatabaseMigrationTarget, fromType: string, toType: string) {
  if (!tableExists(sqlite, 'sync_object_state')) return;
  sqlite.exec(`UPDATE sync_object_state SET object_type = '${toType}' WHERE object_type = '${fromType}'`);
  if (tableExists(sqlite, 'sync_change_log')) {
    sqlite.exec(`UPDATE sync_change_log SET object_type = '${toType}' WHERE object_type = '${fromType}'`);
  }
}
