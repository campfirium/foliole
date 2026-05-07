import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { deflateSync } from 'node:zlib';

import { DATABASE_SCHEMA_VERSION } from '../../lib/core/database/migrations.js';
import { buildSyncPackManifest } from '../../lib/core/sync/syncPackManifest.js';
import { PACK_SCHEMA } from '../../lib/core/sync/syncPackSchema.js';
import { writeStoredZip } from '../diagnostics/zipStore.js';

import { loadOrCreateDesktopDeviceId } from './deviceIdentity.js';
import { writePackManifest, writePackRows } from './syncPackBuilderRows.js';
import { loadMaxStateSeq, loadPackRows, type LoadedSyncPackRows } from './syncPackRows.js';

const require = createRequire(import.meta.url);
const BetterSqlite3 = require('better-sqlite3') as typeof import('better-sqlite3');

interface BuildDesktopSyncPackInput {
  createdAt?: string;
  fromDeviceId?: string;
  outputPath: string;
  packId: string;
  fromStateSeq: number;
  toPeerId?: string;
  toStateSeq?: number;
}

function normalizeSeq(value: number) {
  return Math.max(0, Math.trunc(value));
}

function sha256Uri(buffer: Buffer) {
  return `sha256:${createHash('sha256').update(buffer).digest('hex')}`;
}

function buildContainerManifest(args: {
  compressedBytes: Buffer;
  createdAt: string;
  fromDeviceId: string;
  fromStateSeq: number;
  input: BuildDesktopSyncPackInput;
  rows: LoadedSyncPackRows;
  toStateSeq: number;
  uncompressedBytes: Buffer;
}) {
  const innerManifest = buildSyncPackManifest({
    fromStateSeq: args.fromStateSeq,
    packId: args.input.packId,
    tableRows: {
        content_blobs: args.rows.contentBlobs,
        external_documents: args.rows.externalDocuments,
        node_attachments: args.rows.nodeAttachments,
        node_order: args.rows.nodeOrder,
        nodes: args.rows.nodes,
      review_log: args.rows.reviewLog,
      sync_object_state: args.rows.stateRows,
      sync_objects: args.rows.syncObjects
    },
    toStateSeq: args.toStateSeq
  });
  return {
    format: 'foliole.sync-pack',
    format_version: 1,
    pack_id: args.input.packId,
    from_device_id: args.fromDeviceId,
    to_peer_id: args.input.toPeerId ?? '*',
    schema_version: DATABASE_SCHEMA_VERSION,
    from_state_seq: args.fromStateSeq,
    to_state_seq: args.toStateSeq,
    compression: 'zlib',
    database_file: 'incoming.db.deflate',
    database_uncompressed_sha256: sha256Uri(args.uncompressedBytes),
    database_compressed_sha256: sha256Uri(args.compressedBytes),
    tables: innerManifest.tables,
    created_at: args.createdAt
  };
}

export async function buildDesktopSyncPack(input: BuildDesktopSyncPackInput) {
  const fromStateSeq = normalizeSeq(input.fromStateSeq);
  const toStateSeq = normalizeSeq(input.toStateSeq ?? loadMaxStateSeq());
  const createdAt = input.createdAt ?? new Date().toISOString();
  const fromDeviceId = input.fromDeviceId ?? loadOrCreateDesktopDeviceId(createdAt);
  await fs.mkdir(path.dirname(input.outputPath), { recursive: true });
  await fs.rm(input.outputPath, { force: true });

  const incomingPath = `${input.outputPath}.incoming.db`;
  await fs.rm(incomingPath, { force: true });
  const packDb = new BetterSqlite3(incomingPath);
  try {
    for (const statement of PACK_SCHEMA) {
      packDb.exec(statement);
    }
    const rows = loadPackRows(fromStateSeq, toStateSeq);
    const packToStateSeq = rows.stateRows.at(-1)?.state_seq ?? fromStateSeq;

    const writePack = packDb.transaction(() => {
      writePackManifest(packDb, input, fromStateSeq, packToStateSeq, rows);
      writePackRows(packDb, rows);
    });
    writePack();
    const uncompressedBytes = await fs.readFile(incomingPath);
    const compressedBytes = deflateSync(uncompressedBytes);
    const containerManifest = buildContainerManifest({
      compressedBytes,
      createdAt,
      fromDeviceId,
      fromStateSeq,
      input,
      rows,
      toStateSeq: packToStateSeq,
      uncompressedBytes
    });
    await writeStoredZip(input.outputPath, [
      { name: 'manifest.json', content: Buffer.from(JSON.stringify(containerManifest, null, 2), 'utf8') },
      { name: 'incoming.db.deflate', content: compressedBytes }
    ]);
    return {
      outputPath: input.outputPath,
      packId: input.packId,
      fromStateSeq,
      toStateSeq: packToStateSeq,
      objectCount: rows.stateRows.length,
      bodyBlobCount: rows.contentBlobs.length,
      manifest: containerManifest
    };
  } finally {
    packDb.close();
    await fs.rm(incomingPath, { force: true });
  }
}
