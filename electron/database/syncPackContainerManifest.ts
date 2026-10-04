import { dependencyManifestFields } from '../../lib/core/sync/syncPackDependencyManifest.js';
import {
  SYNC_PACK_COMPRESSION,
  SYNC_PACK_DATABASE_ENTRY,
  SYNC_PACK_FORMAT,
  SYNC_PACK_FORMAT_VERSION,
  SYNC_PACK_PAYLOAD_SCHEMA_VERSION
} from '../../lib/core/sync/syncPackEnvelopeContract.js';
import { buildSyncPackManifest } from '../../lib/core/sync/syncPackManifest.js';

import type { BuildDesktopSyncPackInput } from './syncPackBuilderFromDriver.js';
import type { LoadedDesktopSyncPackRows } from './syncPackLoadedRows.js';
import { syncPackTableRows } from './syncPackTableRows.js';

export function buildContainerManifest(args: {
  compressedSha256: string;
  createdAt: string;
  frontierStateSeq: number;
  fromPeerId: string;
  fromStateSeq: number;
  input: BuildDesktopSyncPackInput;
  rows: LoadedDesktopSyncPackRows;
  sourceEpoch: string;
  toStateSeq: number;
  uncompressedSha256: string;
}) {
  const innerManifest = buildSyncPackManifest({
    frontierStateSeq: args.frontierStateSeq,
    fromStateSeq: args.fromStateSeq,
    packId: args.input.packId,
    ...(args.input.restoreId ? { restoreId: args.input.restoreId } : {}),
    sourceEpoch: args.sourceEpoch,
    tableRows: syncPackTableRows(args.rows),
    toStateSeq: args.toStateSeq
  });
  return {
    ...dependencyManifestFields(args.input),
    format: SYNC_PACK_FORMAT,
    format_version: SYNC_PACK_FORMAT_VERSION,
    pack_id: args.input.packId,
    ...(args.input.restoreId ? { restore_id: args.input.restoreId } : {}),
    from_peer_id: args.fromPeerId,
    to_peer_id: args.input.toPeerId ?? '*',
    schema_version: SYNC_PACK_PAYLOAD_SCHEMA_VERSION,
    source_epoch: args.sourceEpoch,
    from_state_seq: args.fromStateSeq,
    to_state_seq: args.toStateSeq,
    frontier_state_seq: args.frontierStateSeq,
    compression: SYNC_PACK_COMPRESSION,
    database_file: SYNC_PACK_DATABASE_ENTRY,
    database_uncompressed_sha256: args.uncompressedSha256,
    database_compressed_sha256: args.compressedSha256,
    tables: innerManifest.tables,
    created_at: args.createdAt
  };
}
