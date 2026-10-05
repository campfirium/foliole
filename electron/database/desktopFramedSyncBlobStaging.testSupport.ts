import { createHash } from 'node:crypto';

import Database from 'better-sqlite3';

import { FRAMED_SYNC_STAGING_SCHEMA } from '../../lib/core/database/framedSyncStagingSchema.js';
import type { ManifestBlobDescriptor } from '../../lib/core/sync/framedSyncBlobContract.js';
import {
  FRAMED_SYNC_PROTOCOL_VERSION,
  type FramedSyncContext
} from '../../lib/core/sync/framedSyncContract.js';

import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';
import { createDesktopFramedSyncBlobStaging } from './desktopFramedSyncBlobStaging.js';
import { createDesktopFramedSyncStaging } from './desktopFramedSyncStaging.js';

export type BlobFixture = Readonly<{
  data: Uint8Array;
  descriptor: ManifestBlobDescriptor;
}>;

export function digest(value: string | Uint8Array) {
  return new Uint8Array(createHash('sha256').update(value).digest());
}

export function attempt(seed: number) {
  return new Uint8Array(16).fill(seed);
}

export function blob(value: string): BlobFixture {
  const data = new TextEncoder().encode(value);
  return {
    data,
    descriptor: {
      byteLength: BigInt(data.byteLength),
      required: true,
      role: 1,
      sha256: digest(data)
    }
  };
}

export function openBlobDatabase(filePath = ':memory:') {
  const sqlite = new Database(filePath);
  sqlite.pragma('foreign_keys = ON');
  for (const sql of FRAMED_SYNC_STAGING_SCHEMA) sqlite.exec(sql);
  const port = createBetterSqliteDbPort(sqlite);
  return {
    blobStaging: createDesktopFramedSyncBlobStaging(port),
    close: () => { sqlite.close(); },
    port,
    sqlite,
    staging: createDesktopFramedSyncStaging(port)
  };
}

export async function prepareBlobTransfer(input: {
  attemptSeed: number;
  blobs: readonly ManifestBlobDescriptor[];
  database: ReturnType<typeof openBlobDatabase>;
  seed: string;
}) {
  const context: FramedSyncContext = {
    groupId: 'group',
    protocolVersion: FRAMED_SYNC_PROTOCOL_VERSION,
    receiverDeviceId: 'receiver',
    receiverLibraryEpoch: 'receiver-epoch',
    senderDeviceId: 'sender',
    senderLibraryEpoch: 'sender-epoch'
  };
  const attemptId = attempt(input.attemptSeed);
  const contentId = digest(`content:${input.seed}`);
  const transferId = digest(`transfer:${input.seed}`);
  const proposal = {
    blobCount: BigInt(input.blobs.length),
    contentId,
    context,
    factCount: 0n,
    totalBlobBytes: input.blobs.reduce((total, value) => total + value.byteLength, 0n),
    transferId
  };
  const { reservationId } = await input.database.staging.admitInboundProposal(proposal);
  await input.database.staging.commitInboundHeaderDeclaration({
    attemptId,
    blobs: input.blobs,
    facts: [],
    proposal,
    published: { ...proposal, manifestHash: contentId },
    reservationId
  });
  return { attemptId, transferId };
}

export async function promoteBlob(input: {
  attemptId: Uint8Array;
  database: ReturnType<typeof openBlobDatabase>;
  transferId: Uint8Array;
  value: BlobFixture;
}) {
  await input.database.blobStaging.commitBlobOfferAndMissingSet({
    blobs: [input.value.descriptor],
    transferId: input.transferId
  });
  await input.database.blobStaging.writeBlobChunk({
    attemptId: input.attemptId,
    data: input.value.data,
    offset: 0n,
    sha256: input.value.descriptor.sha256,
    transferId: input.transferId
  });
  return input.database.blobStaging.verifyAndMarkBlobAvailable(
    input.transferId,
    input.attemptId,
    input.value.descriptor.sha256
  );
}
