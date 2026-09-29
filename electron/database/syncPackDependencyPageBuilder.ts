import { promises as fs } from 'node:fs';
import path from 'node:path';

import Database from 'better-sqlite3';

import { SYNC_PACK_DEPENDENCY_PAGE_SCHEMA } from '../../lib/core/sync/syncPackDependencyPageApply.js';
import { validateSyncPackDependencyPage, type SyncPackDependencyPage } from '../../lib/core/sync/syncPackDependencyTransfer.js';
import { SYNC_PACK_COMPRESSION, SYNC_PACK_DATABASE_ENTRY, SYNC_PACK_FORMAT,
  SYNC_PACK_FORMAT_VERSION, SYNC_PACK_PAYLOAD_SCHEMA_VERSION } from '../../lib/core/sync/syncPackEnvelopeContract.js';
import { buildSyncPackManifest, SYNC_PACK_TABLE_NAMES, type SyncPackTableName } from '../../lib/core/sync/syncPackManifest.js';
import { PACK_SCHEMA } from '../../lib/core/sync/syncPackSchema.js';
import { writeStoredZipFromFile } from '../diagnostics/zipStore.js';

import { deflateSyncPackDatabase } from './syncPackFileCompression.js';
import { DEFAULT_SYNC_PACK_PAGE_BUDGET } from './syncPackPageBudget.js';

export async function buildSyncPackDependencyPageArchive(args: {
  page: SyncPackDependencyPage; outputPath: string; packId: string;
  fromPeerId: string; toPeerId: string; restoreId?: string;
}) {
  validateSyncPackDependencyPage(args.page);
  if (args.fromPeerId !== args.page.transfer.peerId) throw new Error('sync_pack_dependency_source_mismatch');
  await fs.mkdir(path.dirname(args.outputPath), { recursive: true });
  const root = await fs.mkdtemp(path.join(path.dirname(args.outputPath), '.dependency-pack-'));
  const databasePath = path.join(root, 'incoming.db');
  const compressedPath = path.join(root, 'incoming.db.deflate');
  try {
    const manifest = writeDependencyDatabase(databasePath, args);
    const bytes = (await fs.stat(databasePath)).size;
    if (bytes > DEFAULT_SYNC_PACK_PAGE_BUDGET.databaseBytes) throw new Error('sync_pack_dependency_page_over_budget');
    const checksums = await deflateSyncPackDatabase(databasePath, compressedPath);
    const envelope = { ...manifest, format: SYNC_PACK_FORMAT, format_version: SYNC_PACK_FORMAT_VERSION,
      from_peer_id: args.fromPeerId, to_peer_id: args.toPeerId,
      schema_version: SYNC_PACK_PAYLOAD_SCHEMA_VERSION, compression: SYNC_PACK_COMPRESSION,
      database_file: SYNC_PACK_DATABASE_ENTRY, database_uncompressed_sha256: checksums.raw.sha256,
      database_compressed_sha256: checksums.compressed.sha256, created_at: new Date().toISOString() };
    await writeStoredZipFromFile({ bodyFilePath: compressedPath, bodyName: SYNC_PACK_DATABASE_ENTRY,
      filePath: args.outputPath, manifest: Buffer.from(JSON.stringify(envelope), 'utf8') });
    const archiveBytes = (await fs.stat(args.outputPath)).size;
    if (Math.ceil((archiveBytes + 16) / 3) * 4 + 512 > DEFAULT_SYNC_PACK_PAGE_BUDGET.transferBytes) {
      throw new Error('sync_pack_dependency_page_over_budget');
    }
    return { manifest: envelope, outputPath: args.outputPath };
  } catch (error) {
    await fs.rm(args.outputPath, { force: true });
    throw error;
  } finally { await fs.rm(root, { force: true, recursive: true }); }
}

function writeDependencyDatabase(databasePath: string, args: Parameters<typeof buildSyncPackDependencyPageArchive>[0]) {
  const { rows, ...header } = args.page;
  const transfer = header.transfer;
  const manifest = buildSyncPackManifest({ packId: args.packId,
    ...(args.restoreId ? { restoreId: args.restoreId } : {}),
    dependencyPage: { ...header, rowCount: rows.length }, sourceEpoch: transfer.sourceEpoch,
    fromStateSeq: transfer.fromStateSeq, toStateSeq: transfer.fromStateSeq,
    frontierStateSeq: transfer.frontierStateSeq,
    tableRows: Object.fromEntries(SYNC_PACK_TABLE_NAMES.map((name) => [name, [] as unknown[]])) as Record<SyncPackTableName, unknown[]> });
  const database = new Database(databasePath);
  try {
    database.transaction(() => {
      for (const sql of [...PACK_SCHEMA, SYNC_PACK_DEPENDENCY_PAGE_SCHEMA]) database.exec(sql);
      database.prepare('INSERT INTO pack_manifest VALUES (?, ?)').run('manifest_json', JSON.stringify(manifest));
      const insert = database.prepare('INSERT INTO sync_pack_dependency_page_rows VALUES (?, ?)');
      for (const [index, row] of rows.entries()) insert.run(header.afterRow + index, JSON.stringify(row));
    })();
    return manifest;
  } finally { database.close(); }
}
