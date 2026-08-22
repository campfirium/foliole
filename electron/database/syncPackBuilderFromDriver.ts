import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { deflateSync } from 'node:zlib';

import type { DatabaseDriver } from '../../lib/core/database/driver.js';
import {
  SYNC_PACK_COMPRESSION,
  SYNC_PACK_DATABASE_ENTRY,
  SYNC_PACK_FORMAT,
  SYNC_PACK_FORMAT_VERSION,
  SYNC_PACK_PAYLOAD_SCHEMA_VERSION
} from '../../lib/core/sync/syncPackEnvelopeContract.js';
import { buildSyncPackManifest } from '../../lib/core/sync/syncPackManifest.js';
import { PACK_SCHEMA } from '../../lib/core/sync/syncPackSchema.js';
import { writeStoredZip } from '../diagnostics/zipStore.js';

import { backfillMissingNodeSyncState } from './nodeSyncStateRows.js';
import { writePackManifest, writePackRows } from './syncPackBuilderRows.js';
import { loadSyncPackGroupRows } from './syncPackGroupRows.js';
import type { LoadedDesktopSyncPackRows } from './syncPackLoadedRows.js';
import {
  loadSyncPackNodeVersionParentRows,
  loadSyncPackNodeVersionRows
} from './syncPackNodeVersionRows.js';
import { loadMaxStateSeq, loadPackRows } from './syncPackRows.js';

const require = createRequire(import.meta.url);
const BetterSqlite3 = require('better-sqlite3') as typeof import('better-sqlite3');

export interface BuildDesktopSyncPackInput {
  createdAt?: string;
  fromPeerId: string;
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
  fromPeerId: string;
  fromStateSeq: number;
  input: BuildDesktopSyncPackInput;
  rows: LoadedDesktopSyncPackRows;
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
      node_sync_versions: args.rows.nodeVersions,
      node_sync_version_parents: args.rows.nodeVersionParents,
      nodes: args.rows.nodes,
      review_log: args.rows.reviewLog,
      sync_group_member_departures: args.rows.groupDepartures,
      sync_group_members: args.rows.groupMembers,
      sync_groups: args.rows.groups,
      sync_object_state: args.rows.stateRows,
      sync_objects: args.rows.syncObjects
    },
    toStateSeq: args.toStateSeq
  });
  return {
    format: SYNC_PACK_FORMAT,
    format_version: SYNC_PACK_FORMAT_VERSION,
    pack_id: args.input.packId,
    from_peer_id: args.fromPeerId,
    to_peer_id: args.input.toPeerId ?? '*',
    schema_version: SYNC_PACK_PAYLOAD_SCHEMA_VERSION,
    from_state_seq: args.fromStateSeq,
    to_state_seq: args.toStateSeq,
    compression: SYNC_PACK_COMPRESSION,
    database_file: SYNC_PACK_DATABASE_ENTRY,
    database_uncompressed_sha256: sha256Uri(args.uncompressedBytes),
    database_compressed_sha256: sha256Uri(args.compressedBytes),
    tables: innerManifest.tables,
    created_at: args.createdAt
  };
}

export async function buildDesktopSyncPackFromDriver(
  input: BuildDesktopSyncPackInput,
  sourceDriver: DatabaseDriver
) {
  const fromStateSeq = normalizeSeq(input.fromStateSeq);
  const createdAt = input.createdAt ?? new Date().toISOString();
  backfillMissingNodeSyncState(sourceDriver);
  const toStateSeq = normalizeSeq(input.toStateSeq ?? loadMaxStateSeq(sourceDriver));
  await fs.mkdir(path.dirname(input.outputPath), { recursive: true });
  await fs.rm(input.outputPath, { force: true });
  const incomingPath = `${input.outputPath}.incoming.db`;
  await fs.rm(incomingPath, { force: true });
  const packDb = new BetterSqlite3(incomingPath);
  try {
    for (const statement of PACK_SCHEMA) packDb.exec(statement);
    const baseRows = loadPackRows(fromStateSeq, toStateSeq, sourceDriver);
    const groupRows = loadSyncPackGroupRows(sourceDriver);
    const nodeVersions = loadSyncPackNodeVersionRows(sourceDriver, baseRows.nodes);
    const rows: LoadedDesktopSyncPackRows = {
      ...baseRows,
      groupDepartures: groupRows.departures,
      groupMembers: groupRows.members,
      groups: groupRows.groups,
      nodeVersions,
      nodeVersionParents: loadSyncPackNodeVersionParentRows(sourceDriver, nodeVersions)
    };
    const packToStateSeq = Math.max(
      rows.stateRows.at(-1)?.state_seq ?? fromStateSeq,
      baseRows.consumedStateSeq
    );
    const writePack = packDb.transaction(() => {
      writePackManifest(packDb, input, fromStateSeq, packToStateSeq, rows);
      writePackRows(packDb, rows);
    });
    writePack();
    const uncompressedBytes = await fs.readFile(incomingPath);
    const compressedBytes = deflateSync(uncompressedBytes);
    const containerManifest = buildContainerManifest({
      compressedBytes, createdAt, fromPeerId: input.fromPeerId, fromStateSeq,
      input, rows, toStateSeq: packToStateSeq, uncompressedBytes
    });
    await writeStoredZip(input.outputPath, [
      { name: 'manifest.json', content: Buffer.from(JSON.stringify(containerManifest, null, 2), 'utf8') },
      { name: SYNC_PACK_DATABASE_ENTRY, content: compressedBytes }
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
