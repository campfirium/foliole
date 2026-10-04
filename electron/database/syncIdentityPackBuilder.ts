import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import Database from 'better-sqlite3';

import type { DatabaseDriver } from '../../lib/core/database/driver.js';
import { syncIdentityFingerprint } from '../../lib/core/sync/syncIdentityDigest.js';
import { compareSyncIdentityText } from '../../lib/core/sync/syncIdentityKeyOrder.js';
import { SYNC_IDENTITY_PACK_FORMAT_VERSION } from '../../lib/core/sync/syncIdentityPackManifest.js';
import { parseSyncIdentityPackPage, type SyncIdentityPackPage } from '../../lib/core/sync/syncIdentityPackPage.js';
import { SYNC_PACK_COMPRESSION, SYNC_PACK_DATABASE_ENTRY,
  SYNC_PACK_FORMAT, SYNC_PACK_PAYLOAD_SCHEMA_VERSION } from '../../lib/core/sync/syncPackEnvelopeContract.js';
import type { SyncPackFactClaims } from '../../lib/core/sync/syncPackFactPresence.js';
import { SYNC_PACK_TABLE_NAMES } from '../../lib/core/sync/syncPackManifest.js';
import { PACK_SCHEMA } from '../../lib/core/sync/syncPackSchema.js';
import { writeStoredZipFromFile } from '../diagnostics/zipStore.js';

import { loadSyncIdentityFactPackRows } from './syncIdentityFactPackRows.js';
import { loadSyncIdentityPackRows } from './syncIdentityPackRows.js';
import { writePackRows } from './syncPackBuilderRows.js';
import { deflateSyncPackDatabase } from './syncPackFileCompression.js';
import { DEFAULT_SYNC_PACK_PAGE_BUDGET, measureSyncPackPage,
  syncPackPageFits, type SyncPackPageBudget } from './syncPackPageBudget.js';
import { syncPackTableRows } from './syncPackTableRows.js';

export interface BuildSyncIdentityPackInput {
  page: SyncIdentityPackPage;
  outputPath: string;
  receiverFacts?: SyncPackFactClaims;
  pageBudget?: SyncPackPageBudget;
}

function assertFixedSource(driver: DatabaseDriver, page: SyncIdentityPackPage) {
  const source = driver.queryOne<{ source_view_id: string }>(
    'SELECT source_view_id FROM sync_pack_source_view WHERE singleton_id = 1');
  const group = driver.queryOne<{ group_id: string; local_device_identity_key: string }>(
    'SELECT group_id, local_device_identity_key FROM sync_group_local_state WHERE singleton_id = 1');
  const target = driver.queryOne<{ state: string }>(`SELECT state FROM sync_group_devices
    WHERE group_id = ? AND device_identity_key = ?`, [page.group_id, page.target_peer_id]);
  if (source?.source_view_id !== page.source_view_id || group?.group_id !== page.group_id ||
      group.local_device_identity_key !== page.source_peer_id || target?.state !== 'active') {
    throw new Error('sync_identity_pack_source_changed');
  }
}

function structuralDependencies(rows: ReturnType<typeof loadSyncIdentityPackRows>,
  page: SyncIdentityPackPage) {
  const selected = new Set(page.objects.map((item) => `${item.object_type}\0${item.object_id}`));
  const dependencies = rows.stateRows.filter((row) =>
    !selected.has(`${row.object_type}\0${row.object_id}`)).map((row) => ({
    object_type: row.object_type, object_id: row.object_id,
    fingerprint: syncIdentityFingerprint(row)
  })).sort((left, right) => compareSyncIdentityText(left.object_id, right.object_id));
  if (dependencies.length > 128 || dependencies.some((row) => row.object_type !== 'node')) {
    throw new Error('sync_identity_pack_page_over_budget');
  }
  return dependencies;
}

function loadIdentityRows(sourceDriver: DatabaseDriver, input: BuildSyncIdentityPackInput,
  page: ReturnType<typeof parseSyncIdentityPackPage>) {
  return sourceDriver.transaction((tx) => page.facts && page.facts.section !== 'head'
    ? loadSyncIdentityFactPackRows(tx, page)
    : { rows: loadSyncIdentityPackRows(tx, page, input.receiverFacts,
      input.pageBudget ?? DEFAULT_SYNC_PACK_PAGE_BUDGET), tail: undefined, chunk: undefined });
}

export async function buildSyncIdentityPackFromDriver(input: BuildSyncIdentityPackInput,
  sourceDriver: DatabaseDriver) {
  const page = parseSyncIdentityPackPage(input.page);
  assertFixedSource(sourceDriver, page);
  const loaded = loadIdentityRows(sourceDriver, input, page);
  const { rows } = loaded;
  const dependencies = structuralDependencies(rows, page);
  const tables = syncPackTableRows(rows);
  const packId = randomUUID();
  const inner = { contract: 'global-id-v1', pack_id: packId, identity_page: page,
    dependencies,
    ...(loaded.tail ? { fact_tail: loaded.tail } : {}),
    ...(loaded.chunk ? { fact_chunk: { key: loaded.chunk.key, offset: loaded.chunk.offset, total: loaded.chunk.total } } : {}),
    tables: SYNC_PACK_TABLE_NAMES.map((name) => ({ name, row_count: tables[name].length })) };
  await fs.mkdir(path.dirname(input.outputPath), { recursive: true });
  const databasePath = `${input.outputPath}.incoming.db`;
  const compressedPath = `${databasePath}.deflate`;
  await Promise.all([input.outputPath, databasePath, compressedPath].map((file) =>
    fs.rm(file, { force: true })));
  const db = new Database(databasePath);
  try {
    for (const statement of PACK_SCHEMA) db.exec(statement);
    db.exec('ALTER TABLE sync_object_state ADD COLUMN current_version_id TEXT');
    db.transaction(() => {
      db.prepare('INSERT INTO pack_manifest (key, value) VALUES (?, ?)')
        .run('manifest_json', JSON.stringify(inner));
      writeIdentityRows(db, loaded);
      const head = db.prepare(`UPDATE sync_object_state SET current_version_id = ?
        WHERE object_type = ? AND object_id = ?`);
      for (const row of rows.stateRows) {
        head.run(row.current_version_id, row.object_type, row.object_id);
      }
    })();
    const checksums = await deflateSyncPackDatabase(databasePath, compressedPath);
    const manifest = {
      ...inner,
      format: SYNC_PACK_FORMAT, format_version: SYNC_IDENTITY_PACK_FORMAT_VERSION,
      from_peer_id: page.source_peer_id, to_peer_id: page.target_peer_id,
      schema_version: SYNC_PACK_PAYLOAD_SCHEMA_VERSION,
      compression: SYNC_PACK_COMPRESSION, database_file: SYNC_PACK_DATABASE_ENTRY,
      database_uncompressed_sha256: checksums.raw.sha256,
      database_compressed_sha256: checksums.compressed.sha256,
      created_at: new Date().toISOString()
    };
    await writeStoredZipFromFile({ bodyFilePath: compressedPath,
      bodyName: SYNC_PACK_DATABASE_ENTRY, filePath: input.outputPath,
      manifest: Buffer.from(JSON.stringify(manifest), 'utf8') });
    const measured = await measureSyncPackPage({ archivePath: input.outputPath, databasePath, rows });
    if (!syncPackPageFits(measured, input.pageBudget ?? DEFAULT_SYNC_PACK_PAGE_BUDGET)) {
      throw new Error('sync_identity_pack_page_over_budget');
    }
    return { manifest, measured, outputPath: input.outputPath };
  } catch (error) {
    await fs.rm(input.outputPath, { force: true });
    throw error;
  } finally {
    db.close();
    await Promise.all([databasePath, compressedPath].map((file) => fs.rm(file, { force: true })));
  }
}

function writeIdentityRows(db: Database.Database, loaded: ReturnType<typeof loadIdentityRows>) {
      if (loaded.chunk) db.prepare('INSERT INTO pack_manifest (key, value) VALUES (?, ?)')
        .run('fact_chunk', JSON.stringify(loaded.chunk));
      writePackRows(db, loaded.rows);
}
