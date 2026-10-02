// @vitest-environment node

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-public-database-upgrades-app-data';
let mockedDocumentsDir = '/tmp/foliole-public-database-upgrades-documents';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_data_dir: mockedAppDataDir,
    app_log_dir: path.join(mockedAppDataDir, 'logs'),
    documents_dir: mockedDocumentsDir
  })
}));

import {
  DATABASE_SCHEMA_VERSION,
  initializeDatabaseSchema,
  loadWorkspaceSnapshot
} from '../../lib/core/database/index.js';
import { validatePublicDesktopDatabaseLedger } from '../../scripts/database/public-desktop-database-ledger.mjs';
import {
  findMissingDatabaseCapabilities,
  readDatabaseCapabilities
} from '../../scripts/database/public-desktop-database-upgrade-contract.mjs';

import { restoreApplicationDatabaseBackup } from './backupRestore.js';
import { createBetterSqlite3Driver } from './betterSqlite3Driver.js';
import { closeDatabaseConnection, resolveDatabasePath } from './connection.js';
import { waitForManagedSafetySnapshotSettlements } from './managedSafetySnapshots.js';
import { initializeDatabase } from './migrate.js';

const fixtureRoot = path.resolve('electron/database/fixtures/public-desktop-main');
const ledgerPath = path.resolve('lib/core/database/publicDesktopDatabaseLedger.json');
const manifestPath = path.join(fixtureRoot, 'manifest.json');
const ledger = validatePublicDesktopDatabaseLedger(JSON.parse(readFileSync(ledgerPath, 'utf8')));
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const fixtureRegistrations = ledger.fixtures as Array<{
  file: string;
  schema: number;
  sourceRelease: string;
}>;
let requiredCapabilities: ReturnType<typeof readDatabaseCapabilities>;
let tempRoot = '';

beforeAll(async () => {
  tempRoot = await mkdtemp(path.join(os.tmpdir(), 'foliole-public-database-upgrades-'));
  const fresh = new Database(':memory:');
  try {
    initializeDatabaseSchema(fresh);
    requiredCapabilities = readDatabaseCapabilities(fresh);
  } finally {
    fresh.close();
  }
});

afterAll(async () => {
  closeDatabaseConnection();
  await waitForManagedSafetySnapshotSettlements();
  if (tempRoot) await rm(tempRoot, { force: true, recursive: true });
});

function assertCurrentDatabase(sqlite: Database.Database, driver = createBetterSqlite3Driver(sqlite)) {
  expect(sqlite.pragma('user_version', { simple: true })).toBe(DATABASE_SCHEMA_VERSION);
  expect(sqlite.pragma('integrity_check', { simple: true })).toBe('ok');
  expect(sqlite.pragma('foreign_key_check')).toEqual([]);
  expect(findMissingDatabaseCapabilities(
    readDatabaseCapabilities(sqlite),
    requiredCapabilities
  )).toEqual([]);
  const snapshot = loadWorkspaceSnapshot(driver, { includeBody: true });
  expect(snapshot?.nodeOrder.length).toBeGreaterThan(0);
  expect(snapshot?.nodesById['t166-root']).toMatchObject({ content: '# Stable user content' });
  expect(snapshot?.nodesById['t166-child']).toMatchObject({
    content: 'Preserve this child.', parentNodeId: 't166-root',
    review: { state: 2, stability: 3.5, difficulty: 4.25, reps: 5, lapses: 1 },
    reading: { intervalDurationMs: 900000, intervalGrowthFactor: 1.75, repetitionCount: 3 }
  });
  expect(sqlite.prepare("SELECT value FROM settings WHERE key = 't166.fixture.preference'").get())
    .toEqual({ value: '{"enabled":true}' });
}

async function installFixtureAsProductionDatabase(registration: { file: string; schema: number }) {
  const testRoot = path.join(tempRoot, `${registration.schema}-production`);
  mockedAppDataDir = path.join(testRoot, 'app-data');
  mockedDocumentsDir = path.join(testRoot, 'Documents');
  const databasePath = path.join(mockedDocumentsDir, 'Foliole', 'Data', 'foliole.db');
  await mkdir(path.dirname(databasePath), { recursive: true });
  await copyFile(path.join(fixtureRoot, registration.file), databasePath);
  return databasePath;
}

function assertProductionOpen(databasePath: string) {
  const connection = initializeDatabase();
  try {
    expect(resolveDatabasePath()).toBe(databasePath);
    assertCurrentDatabase(connection.sqlite, connection.driver);
  } finally {
    closeDatabaseConnection();
  }
}

describe('public Desktop database upgrade matrix', () => {
  it('covers every registered fixture', () => {
    for (const fixture of fixtureRegistrations) {
      const provenance = manifest.fixtures.find((entry: { schema: number }) => entry.schema === fixture.schema);
      expect(provenance).toMatchObject(fixture);
    }
    expect(fixtureRegistrations.map(({ schema }) => schema))
      .toEqual([46, 48, 61, 62, 65, 66, 77, 78]);
  });

  it.each(fixtureRegistrations)(
    'upgrades schema $schema through the current production contracts',
    async (registration) => {
      const databasePath = await installFixtureAsProductionDatabase(registration);
      assertProductionOpen(databasePath);
      assertProductionOpen(databasePath);

      const raw = new Database(databasePath);
      try {
        const totalChanges = () => raw.prepare('SELECT total_changes() AS count').get() as { count: number };
        expect(totalChanges().count).toBe(0);
        initializeDatabaseSchema(raw);
        expect(totalChanges().count).toBe(0);
      } finally {
        raw.close();
      }
    }
  );

  it.each(fixtureRegistrations.filter(({ schema }) => schema < DATABASE_SCHEMA_VERSION))(
    'rolls schema $schema back when the upgrade fails before version commit',
    async (registration) => {
      const databasePath = await installFixtureAsProductionDatabase(registration);
      const sqlite = new Database(databasePath);
      try {
        const protectedRows = readProtectedFixtureRows(sqlite);
        expect(() => initializeDatabaseSchema(sqlite, {
          beforeVersionCommit: () => { throw new Error('injected public upgrade failure'); }
        })).toThrow('injected public upgrade failure');
        expect(sqlite.pragma('user_version', { simple: true })).toBe(registration.schema);
        expect(sqlite.pragma('integrity_check', { simple: true })).toBe('ok');
        expect(sqlite.pragma('foreign_key_check')).toEqual([]);
        expect(readProtectedFixtureRows(sqlite)).toEqual(protectedRows);
      } finally {
        sqlite.close();
      }
      assertProductionOpen(databasePath);
      assertProductionOpen(databasePath);
    }
  );
});

function readProtectedFixtureRows(sqlite: Database.Database) {
  return ['nodes', 'node_review', 'node_reading', 'settings'].map((table) =>
    sqlite.prepare(`SELECT * FROM ${table} ORDER BY 1`).all());
}

describe('populated historical Desktop database upgrades', () => {
  it.each(fixtureRegistrations.filter(({ schema }) => [62, 78].includes(schema)))(
    'upgrades and restores populated schema $schema with obsolete file mappings', async (registration) => {
      const databasePath = await installFixtureAsProductionDatabase(registration);
      const bytes = Buffer.from([0xff, 0xd8, 0xff, ...Buffer.from(`legacy-${registration.schema}`)]);
      const id = createHash('sha256').update(bytes).digest('hex');
      const assetsDir = path.join(mockedDocumentsDir, 'Foliole', 'Assets');
      await mkdir(assetsDir, { recursive: true });
      await writeFile(path.join(assetsDir, `${id}.jpg`), bytes);
      const backupPath = path.join(path.dirname(databasePath), 'legacy-backup.db');
      const raw = new Database(databasePath);
      try {
        raw.prepare('INSERT INTO attachments (id, original_name, mime_type, size_bytes, created_at) VALUES (?, ?, ?, ?, ?)')
          .run(id, 'legacy.jpg', 'image/jpeg', bytes.length, '2026-08-03T00:00:00.000Z');
        raw.prepare(`INSERT INTO attachment_blobs (attachment_id, content_hash, storage_key, mime_type, size_bytes, created_at)
          VALUES (?, ?, ?, ?, ?, ?)`).run(id, id, registration.schema === 62 ? `${id}.jpeg` : id,
          'image/jpeg', bytes.length, '2026-08-03T00:00:00.000Z');
        raw.prepare('INSERT INTO node_attachments (node_id, attachment_id, role) VALUES (?, ?, ?)')
          .run('t166-root', id, 'image');
        await raw.backup(backupPath);
      } finally { raw.close(); }
      assertProductionOpen(databasePath);
      await restoreApplicationDatabaseBackup({ sourcePath: backupPath });
      const connection = initializeDatabase();
      assertCurrentDatabase(connection.sqlite, connection.driver);
      const row = connection.sqlite.prepare('SELECT resource_references FROM nodes WHERE id = ?')
        .get('t166-root') as { resource_references: string };
      expect(JSON.parse(row.resource_references)).toEqual([
        { storage_key: `${id}.jpg`, role: 'image', original_name: 'legacy.jpg' }
      ]);
      expect(readFileSync(path.join(assetsDir, `${id}.jpg`))).toEqual(bytes);
      closeDatabaseConnection();
      assertProductionOpen(databasePath);
    }
  );
});
