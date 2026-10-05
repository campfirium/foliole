// @vitest-environment node

import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it } from 'vitest';

import { FRAMED_SYNC_STAGING_SCHEMA } from '../../lib/core/database/framedSyncStagingSchema.js';
import {
  canonicalContentId,
  canonicalManifestBytes,
  canonicalTransferId,
  type CanonicalManifest
} from '../../lib/core/sync/framedSyncCanonicalManifest.js';
import {
  FRAMED_SYNC_PROTOCOL_VERSION,
  type FramedSyncContext,
  type PreparedTransferAttempt,
  type StoredEncryptedFrame
} from '../../lib/core/sync/framedSyncContract.js';
import type { OutboundPublishInput } from '../../lib/core/sync/framedSyncStagingContract.js';

import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';
import { createDesktopFramedSyncStaging } from './desktopFramedSyncStaging.js';

let sqlite: Database.Database;
let temporaryRoot: string | null;

beforeEach(() => {
  temporaryRoot = null;
  sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  for (const sql of FRAMED_SYNC_STAGING_SCHEMA) sqlite.exec(sql);
});

afterEach(async () => {
  sqlite.close();
  if (temporaryRoot) await fs.rm(temporaryRoot, { force: true, recursive: true });
});

const digest = (value: string) => new Uint8Array(createHash('sha256').update(value).digest());
const attempt = (seed: number): PreparedTransferAttempt => ({
  attemptId: Uint8Array.from({ length: 16 }, () => seed),
  noncePrefix: Uint8Array.from({ length: 4 }, () => seed + 1),
  preamble: Uint8Array.from({ length: 96 }, () => seed + 2),
  state: 'prepared'
});
const frame = (sequence: bigint, seed: number): StoredEncryptedFrame => ({
  ciphertext: Uint8Array.of(seed, seed + 1),
  frameHeader: Uint8Array.from({ length: 16 }, () => seed),
  frameType: 3,
  sequence
});

async function fixture(seed: string) {
  const data = new TextEncoder().encode(`blob-${seed}`);
  const blob = { byteLength: BigInt(data.byteLength), required: true, role: 1, sha256: digest(`blob-${seed}`) };
  const manifest: CanonicalManifest = {
    blobs: [blob],
    facts: [{ blobs: [blob], body: [], factId: `fact-${seed}`, globalId: `global-${seed}`,
      kind: 1, objectType: 'node', sharedStateHash: digest(`state-${seed}`) }]
  };
  const context: FramedSyncContext = {
    groupId: 'group', protocolVersion: FRAMED_SYNC_PROTOCOL_VERSION,
    receiverDeviceId: 'receiver', receiverLibraryEpoch: 'receiver-epoch',
    senderDeviceId: 'sender', senderLibraryEpoch: 'sender-epoch'
  };
  const contentId = await canonicalContentId(manifest);
  const transferId = await canonicalTransferId(context, contentId);
  const publication: OutboundPublishInput = {
    contentId, context, manifest, manifestHash: contentId, transferId
  };
  return { blob, contentId, context, data, manifest, publication, transferId };
}

function headerFor(value: Awaited<ReturnType<typeof fixture>>, proposal: {
  blobCount: bigint; contentId: Uint8Array; context: FramedSyncContext; factCount: bigint;
  totalBlobBytes: bigint; transferId: Uint8Array;
}, reservationId: string, attemptId: Uint8Array) {
  const fact = value.manifest.facts[0]!;
  return { attemptId, blobs: [value.blob], facts: [{ factId: fact.factId, globalId: fact.globalId,
    kind: fact.kind, objectType: fact.objectType, requiredBlobHashes: [value.blob.sha256],
    sharedStateHash: fact.sharedStateHash }], proposal,
    published: { ...proposal, manifestHash: value.contentId }, reservationId };
}

function canonicalFactBytes(manifest: CanonicalManifest) {
  const complete = canonicalManifestBytes(manifest);
  const domainBytes = new TextEncoder().encode('foliole-framed-sync-content-v1').byteLength;
  const prefixBytes = 4 + domainBytes + 4;
  const blobBytes = 4 + manifest.blobs.length * (4 + 32 + 8 + 4 + 1);
  return complete.slice(prefixBytes, complete.byteLength - blobBytes);
}

it('keeps a published transfer immutable and replays only finalized ciphertext', async () => {
  const value = await fixture('outbound');
  const staging = createDesktopFramedSyncStaging(createBetterSqliteDbPort(sqlite));
  expect(await staging.publishOutbound(value.publication)).toBe('created');
  expect(await staging.publishOutbound(value.publication)).toBe('identical');
  expect(await staging.loadOutboundPublication(value.transferId)).toEqual(value.publication);

  const prepared = attempt(1);
  expect(await staging.persistOutboundAttempt(value.transferId, prepared)).toBe('created');
  expect(await staging.commitOutboundFrame(value.transferId, prepared.attemptId, frame(0n, 4))).toBe('created');
  await expect(staging.loadReplayableFrames(value.transferId, prepared.attemptId))
    .rejects.toThrow('outbound_attempt_not_replayable');
  expect(await staging.finalizeOutboundAttempt(value.transferId, prepared.attemptId)).toBe('replayable');
  expect(await staging.loadReplayableFrames(value.transferId, prepared.attemptId)).toEqual([frame(0n, 4)]);
  await expect(staging.commitOutboundFrame(value.transferId, prepared.attemptId, frame(1n, 5)))
    .rejects.toThrow('outbound_attempt_not_prepared');

  const receipt = { appliedStateHash: digest('applied'), contentId: value.contentId,
    receiverDeviceId: 'receiver', receiverLibraryEpoch: 'receiver-epoch', transferId: value.transferId };
  expect(await staging.commitOutboundReceipt(receipt)).toBe('committed');
  await staging.releaseOutboundHolds(value.transferId);
  expect(sqlite.prepare('SELECT count(*) AS count FROM framed_sync_outbound_holds').get()).toEqual({ count: 0 });
});

it('promotes verified attempt data, commits apply with its receipt, and replays receipt frames', async () => {
  const value = await fixture('inbound');
  const staging = createDesktopFramedSyncStaging(createBetterSqliteDbPort(sqlite));
  const proposal = { blobCount: 1n, contentId: value.contentId, context: value.context,
    factCount: 1n, totalBlobBytes: value.blob.byteLength, transferId: value.transferId };
  const { reservationId } = await staging.admitInboundProposal(proposal);
  const incomingAttempt = attempt(7);
  const header = headerFor(value, proposal, reservationId, incomingAttempt.attemptId);
  expect(await staging.commitInboundHeaderDeclaration(header)).toBe('created');
  expect(await staging.loadInboundHeaderDeclaration(value.transferId)).toEqual(header);
  expect(await staging.commitAuthenticatedFrame({ attemptId: incomingAttempt.attemptId,
    authenticatedPlaintext: Uint8Array.of(1), ciphertext: Uint8Array.of(2),
    frameHeader: frame(0n, 1).frameHeader, frameType: 3, preamble: incomingAttempt.preamble,
    sequence: 0n, transferId: value.transferId })).toBe('created');
  const fact = value.manifest.facts[0]!;
  expect(await staging.stageInboundFact({ attemptId: incomingAttempt.attemptId,
    canonicalBytes: canonicalFactBytes(value.manifest), factId: fact.factId, factKind: fact.kind,
    globalId: fact.globalId, objectType: fact.objectType, transferId: value.transferId })).toBe('created');
  expect(await staging.commitBlobOfferAndMissingSet({ blobs: [value.blob], transferId: value.transferId }))
    .toEqual([value.blob.sha256]);
  expect(await staging.writeBlobChunk({ attemptId: incomingAttempt.attemptId, data: value.data,
    offset: 0n, sha256: value.blob.sha256, transferId: value.transferId })).toBe('created');
  expect(await staging.finalizeInboundAttempt({ attemptId: incomingAttempt.attemptId,
    blobCount: 1n, factCount: 1n, manifestHash: value.contentId, transferId: value.transferId })).toBe('created');
  expect(await staging.verifyAndMarkBlobAvailable(value.transferId, incomingAttempt.attemptId,
    value.blob.sha256)).toBe('available');
  await staging.markReadyToApply(value.transferId);

  const receipt = await staging.commitApplyAndReceipt({ appliedStateHash: digest('applied-inbound'),
    contentId: value.contentId, receiverDeviceId: 'receiver', receiverLibraryEpoch: 'receiver-epoch',
    transferId: value.transferId });
  expect(await staging.loadReceipt(value.transferId)).toEqual(receipt);
  const receiptAttempt = attempt(9);
  expect(await staging.persistReceiptAttempt(receipt, receiptAttempt)).toBe('created');
  expect(await staging.commitReceiptFrame(value.transferId, receiptAttempt.attemptId, frame(0n, 8))).toBe('created');
  await staging.finalizeReceiptAttempt(value.transferId, receiptAttempt.attemptId);
  expect(await staging.loadReplayableReceiptFrames(value.transferId, receiptAttempt.attemptId)).toEqual([frame(0n, 8)]);
  await staging.releasePins(value.transferId, 'business_reference_committed');
  expect(sqlite.prepare('SELECT count(*) AS count FROM framed_sync_blob_pins').get()).toEqual({ count: 0 });
});

it('invalidates all attempt-scoped facts, chunks, and authenticated frames', async () => {
  const value = await fixture('invalid');
  const staging = createDesktopFramedSyncStaging(createBetterSqliteDbPort(sqlite));
  const proposal = { blobCount: 1n, contentId: value.contentId, context: value.context,
    factCount: 1n, totalBlobBytes: value.blob.byteLength, transferId: value.transferId };
  const { reservationId } = await staging.admitInboundProposal(proposal);
  const doomed = attempt(3);
  const header = headerFor(value, proposal, reservationId, doomed.attemptId);
  await staging.commitInboundHeaderDeclaration(header);
  const fact = value.manifest.facts[0]!;
  await staging.stageInboundFact({ attemptId: doomed.attemptId, canonicalBytes: canonicalFactBytes(value.manifest),
    factId: fact.factId, factKind: fact.kind, globalId: fact.globalId,
    objectType: fact.objectType, transferId: value.transferId });
  await staging.commitBlobOfferAndMissingSet({ blobs: [value.blob], transferId: value.transferId });
  await staging.writeBlobChunk({ attemptId: doomed.attemptId, data: value.data,
    offset: 0n, sha256: value.blob.sha256, transferId: value.transferId });
  await expect(staging.finalizeInboundAttempt({ attemptId: doomed.attemptId, blobCount: 1n,
    factCount: 1n, manifestHash: digest('wrong-trailer'), transferId: value.transferId }))
    .rejects.toThrow('inbound_attempt_manifest_mismatch');
  expect(await staging.loadAttemptFacts(value.transferId, doomed.attemptId)).toEqual([]);
  expect(sqlite.prepare('SELECT count(*) AS count FROM framed_sync_blob_chunks').get()).toEqual({ count: 0 });
  expect(sqlite.prepare('SELECT count(*) AS count FROM framed_sync_inbound_frames').get()).toEqual({ count: 0 });
  expect(sqlite.prepare('SELECT count(*) AS count FROM framed_sync_blob_offers').get()).toEqual({ count: 0 });
  await expect(staging.stageInboundFact({ attemptId: doomed.attemptId, canonicalBytes: Uint8Array.of(1),
    factId: fact.factId, factKind: fact.kind, globalId: fact.globalId,
    objectType: fact.objectType, transferId: value.transferId })).rejects.toThrow('inbound_header_required');
});

it('releases an outbound hold only for its acknowledged receiver', async () => {
  const value = await fixture('termination');
  const staging = createDesktopFramedSyncStaging(createBetterSqliteDbPort(sqlite));
  await staging.publishOutbound(value.publication);
  await expect(staging.acknowledgeTermination(value.transferId, 'receiver'))
    .rejects.toThrow('termination_request_required');
  expect(sqlite.prepare('SELECT count(*) AS count FROM framed_sync_outbound_holds').get()).toEqual({ count: 1 });
  expect(await staging.persistTerminationRequest({ authorDeviceId: 'sender', memberId: 'receiver',
    transferId: value.transferId })).toBe('created');
  await staging.acknowledgeTermination(value.transferId, 'receiver');
  expect(sqlite.prepare('SELECT count(*) AS count FROM framed_sync_outbound_holds').get()).toEqual({ count: 0 });
});

it('requires the matching durable termination request after SQLite reopens', async () => {
  sqlite.close();
  temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-framed-termination-'));
  const databasePath = path.join(temporaryRoot, 'staging.db');
  sqlite = new Database(databasePath);
  sqlite.pragma('foreign_keys = ON');
  for (const sql of FRAMED_SYNC_STAGING_SCHEMA) sqlite.exec(sql);
  const requested = await fixture('requested');
  const missing = await fixture('missing');
  let staging = createDesktopFramedSyncStaging(createBetterSqliteDbPort(sqlite));
  await staging.publishOutbound(requested.publication);
  await staging.publishOutbound(missing.publication);
  seedPinnedTransfer(requested.transferId, requested.contentId, requested.blob.sha256);
  seedPinnedTransfer(missing.transferId, missing.contentId, missing.blob.sha256);
  await staging.persistTerminationRequest({ authorDeviceId: 'sender', memberId: 'receiver',
    transferId: requested.transferId });
  sqlite.close();

  sqlite = new Database(databasePath);
  sqlite.pragma('foreign_keys = ON');
  staging = createDesktopFramedSyncStaging(createBetterSqliteDbPort(sqlite));
  await expect(staging.acknowledgeTermination(missing.transferId, 'receiver'))
    .rejects.toThrow('termination_request_required');
  await staging.acknowledgeTermination(requested.transferId, 'receiver');
  expect(sqlite.prepare('SELECT count(*) AS count FROM framed_sync_outbound_holds').get()).toEqual({ count: 1 });
  expect(sqlite.prepare('SELECT count(*) AS count FROM framed_sync_blob_pins').get()).toEqual({ count: 1 });
});

function seedPinnedTransfer(transferId: Uint8Array, contentId: Uint8Array, sha256: Uint8Array) {
  sqlite.prepare(`INSERT INTO framed_sync_inbound_transfers
    (transfer_id, content_id, protocol_version, group_id, sender_device_id, sender_library_epoch,
     receiver_device_id, receiver_library_epoch, fact_count, blob_count, total_blob_bytes, reservation_id, state)
    VALUES (?, ?, 22, 'group', 'sender', 'sender-epoch', 'receiver', 'receiver-epoch', 0, 0, 0, ?, 'proposed')`
  ).run(transferId, contentId, `reservation-${Buffer.from(transferId).toString('hex')}`);
  sqlite.prepare('INSERT OR IGNORE INTO framed_sync_available_blobs VALUES (?, 0, ?)').run(sha256, Buffer.alloc(0));
  sqlite.prepare('INSERT INTO framed_sync_blob_pins VALUES (?, ?, 0, 1, 1)').run(transferId, sha256);
}
