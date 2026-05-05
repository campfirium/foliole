import { createHash } from 'node:crypto';

import type { DatabaseMigrationTarget } from './migrationTypes.js';

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
      backfillTextBodyBlobHashes(sqlite, {
        bodyHashColumn: 'body_blob_hash',
        contentColumn: 'content',
        idColumn: 'id',
        kind: 'text_body',
        tableName: 'nodes',
        updatedAtColumn: 'updated_at'
      });
      backfillTextBodyBlobHashes(sqlite, {
        bodyHashColumn: 'body_blob_hash',
        contentColumn: 'content',
        idColumn: 'document_id',
        kind: 'text_body',
        tableName: 'external_documents',
        updatedAtColumn: 'updated_at'
      });
    }
  },
  {
    version: 30,
    migrate: (sqlite) => {
      sqlite.exec(`CREATE TABLE IF NOT EXISTS content_blob_data (
        hash TEXT PRIMARY KEY REFERENCES content_blobs(hash) ON DELETE CASCADE,
        data BLOB NOT NULL
      )`);
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

function sha256Hex(text: string) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function byteLength(text: string) {
  return Buffer.byteLength(text, 'utf8');
}

function backfillTextBodyBlobHashes(sqlite: DatabaseMigrationTarget, args: {
  bodyHashColumn: string;
  contentColumn: string;
  idColumn: string;
  kind: string;
  tableName: string;
  updatedAtColumn: string;
}) {
  if (!tableExists(sqlite, args.tableName)) return;
  const rows = sqlite
    .prepare(
      `SELECT ${args.idColumn} AS id, ${args.contentColumn} AS content, ${args.updatedAtColumn} AS updated_at
       FROM ${args.tableName}
       WHERE ${args.bodyHashColumn} IS NULL AND ${args.contentColumn} IS NOT NULL`
    )
    .all() as Array<{ content: string; id: string; updated_at: string }>;
  const insertBlob = sqlite.prepare(
    `INSERT INTO content_blobs (
       hash, storage_key, kind, mime_type, compression, original_size_bytes, stored_size_bytes,
       original_sha256, stored_sha256, availability, created_at, cached_at, last_verified_at
     ) VALUES (?, ?, ?, 'text/plain', 'none', ?, ?, ?, ?, 'local', ?, ?, ?)
     ON CONFLICT(hash) DO NOTHING`
  );
  const updateOwner = sqlite.prepare(`UPDATE ${args.tableName} SET ${args.bodyHashColumn} = ? WHERE ${args.idColumn} = ?`);

  for (const row of rows) {
    const hash = sha256Hex(row.content);
    const size = byteLength(row.content);
    const timestamp = row.updated_at;
    insertBlob.run(hash, `text/${hash}`, args.kind, size, size, hash, hash, timestamp, timestamp, timestamp);
    updateOwner.run(hash, row.id);
  }
}

function backfillTextBodyBlobData(sqlite: DatabaseMigrationTarget, args: {
  bodyHashColumn: string;
  contentColumn: string;
  tableName: string;
}) {
  if (!tableExists(sqlite, args.tableName)) return;
  const rows = sqlite
    .prepare(
      `SELECT ${args.bodyHashColumn} AS hash, ${args.contentColumn} AS content
       FROM ${args.tableName}
       WHERE ${args.bodyHashColumn} IS NOT NULL AND ${args.contentColumn} IS NOT NULL`
    )
    .all() as Array<{ content: string; hash: string }>;
  const insertData = sqlite.prepare(
    `INSERT INTO content_blob_data (hash, data)
     VALUES (?, ?)
     ON CONFLICT(hash) DO NOTHING`
  );

  for (const row of rows) {
    insertData.run(row.hash, Buffer.from(row.content, 'utf8'));
  }
}
