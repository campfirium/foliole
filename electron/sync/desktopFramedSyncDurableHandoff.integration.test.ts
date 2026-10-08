// @vitest-environment node
import { createHash } from 'node:crypto';
import { readFile, rm } from 'node:fs/promises';
import path from 'node:path';

import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { decodeFrameHeader } from '../../lib/core/sync/framedSyncFraming.js';
import { ensureFramedSyncMissingResourceDemand } from '../../lib/core/sync/framedSyncResourceDemands.js';
import type { FramedSyncStagingPort } from '../../lib/core/sync/framedSyncStagingPort.js';
import { clearAttachmentLibraryPathSnapshot, publishAttachmentLibraryPathSnapshot }
  from '../attachments/attachmentLibraryPathSnapshot.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';
import { createDesktopFramedSyncStaging } from '../database/desktopFramedSyncStaging.js';
import { textDevice } from '../database/topicTextState.testSupport.js';

import { encodeFramedSyncHttpBody } from './desktopFramedSyncHttpWriter.js';
import { loadDesktopFramedSyncPreparedTransferBody } from './desktopFramedSyncPreparedTransferBody.js';
import { prepareDesktopFramedSyncPublishedDelivery } from './desktopFramedSyncProcessOutbound.js';
import { readReceipt } from './desktopFramedSyncProcessReceipt.js';
import { receiveDesktopFramedSyncTransfer } from './desktopFramedSyncProcessReceiver.js';
import { desktopResourceReadyFixture } from './desktopFramedSyncResourceReady.testSupport.js';
import type { FramedSyncEncodedFrame } from './desktopFramedSyncStream.js';

const groupKey = new Uint8Array(32).fill(5);
const groupSecret = Buffer.from(groupKey).toString('base64url');

async function reopen(sqlite: Database.Database, filename: string) {
  await sqlite.backup(filename);
  sqlite.close();
  const restarted = new Database(filename);
  const db = createBetterSqliteDbPort(restarted);
  return { sqlite: restarted, db, staging: createDesktopFramedSyncStaging(db) };
}

async function* wireFrames(frames: AsyncIterable<FramedSyncEncodedFrame>) {
  for await (const frame of frames) yield { ...frame, header: decodeFrameHeader(frame.headerBytes) };
}

function failSourceHandoff(staging: FramedSyncStagingPort, boundary: string): FramedSyncStagingPort {
  return { ...staging,
    commitOutboundFrame: async (...args) => {
      const result = await staging.commitOutboundFrame(...args);
      if (boundary === 'committed_frame' && args[2].frameType === 4) throw new Error('injected_source_handoff');
      return result;
    },
    finalizeOutboundAttempt: async (...args) => {
      if (boundary === 'sealed_body') throw new Error('injected_source_handoff');
      return staging.finalizeOutboundAttempt(...args);
    }
  };
}

it.each(['committed_frame', 'sealed_body'])('recovers fixed publication after failure at %s', async boundary => {
  const source = await desktopResourceReadyFixture();
  let sqlite = source.sqlite;
  const publication = { ...source.published, manifest: { facts: [source.fact], blobs: source.fact.blobs } };
  let body: Awaited<ReturnType<typeof loadDesktopFramedSyncPreparedTransferBody>> | undefined;
  try {
    await source.staging.publishOutbound(publication);
    await expect(prepareDesktopFramedSyncPublishedDelivery({ db: source.db, publication, groupSecret,
      staging: failSourceHandoff(source.staging, boundary) })).rejects.toThrow('injected_source_handoff');
    expect(sqlite.prepare('SELECT state FROM framed_sync_outbound_attempts').pluck().all()).toEqual(['abandoned']);
    expect(sqlite.prepare('SELECT count(*) FROM framed_sync_outbound_frames').pluck().get()).toBe(0);
    expect(sqlite.prepare('SELECT count(*) FROM framed_sync_outbound_holds').pluck().get()).toBe(1);
    const restarted = await reopen(sqlite, path.join(source.root, 'source-restarted.sqlite'));
    sqlite = restarted.sqlite;
    expect(await restarted.staging.loadOutboundPublication(publication.transferId)).toEqual(publication);
    const delivery = await prepareDesktopFramedSyncPublishedDelivery({ ...restarted, publication, groupSecret });
    body = delivery.body;
    expect(sqlite.prepare('SELECT state FROM framed_sync_outbound_attempts ORDER BY rowid').pluck().all())
      .toEqual(['abandoned', 'replayable']);
    const replay = await loadDesktopFramedSyncPreparedTransferBody({ ...restarted, publication, attempt: delivery.attempt });
    try {
      const hash = createHash('sha256');
      for await (const bytes of encodeFramedSyncHttpBody(replay)) hash.update(bytes);
      expect(hash.digest('hex')).toBe(body.bodySha256);
      expect(replay.contentLength).toBe(body.contentLength);
    } finally { await replay.dispose?.(); }
  } finally {
    await body?.dispose?.();
    sqlite.close();
    clearAttachmentLibraryPathSnapshot();
    await rm(source.root, { recursive: true, force: true });
  }
});

function failReceiverHandoff(staging: FramedSyncStagingPort, boundary: string): FramedSyncStagingPort {
  return { ...staging,
    commitAuthenticatedFrame: async frame => {
      const result = await staging.commitAuthenticatedFrame(frame);
      if (boundary === 'fsynced_resource' && frame.frameType === 4) throw new Error('injected_receiver_handoff');
      return result;
    },
    markReadyToApply: async transferId => {
      if (boundary === 'verified_resource') throw new Error('injected_receiver_handoff');
      return staging.markReadyToApply(transferId);
    }
  };
}

it.each(['fsynced_resource', 'verified_resource'])('retries the exact resource after failure at %s', async boundary => {
  const source = await desktopResourceReadyFixture();
  const receiver = textDevice();
  let sqlite = receiver.sqlite;
  const publication = { ...source.published, manifest: { facts: [source.fact], blobs: source.fact.blobs } };
  const assetsDir = path.join(source.root, 'receiver', 'Assets');
  let body: Awaited<ReturnType<typeof loadDesktopFramedSyncPreparedTransferBody>> | undefined;
  try {
    await ensureFramedSyncMissingResourceDemand(receiver.db, { ...publication.context, globalId: 'article',
      versionId: 'version', bodyHash: 'a'.repeat(64), storageKey: source.resource.storageKey }, () => 'demand-1');
    await source.staging.publishOutbound(publication);
    const delivery = await prepareDesktopFramedSyncPublishedDelivery({ db: source.db,
      staging: source.staging, publication, groupSecret });
    body = delivery.body;
    publishAttachmentLibraryPathSnapshot({ assetsDir, libraryScope: path.dirname(assetsDir) });
    await expect(receiveDesktopFramedSyncTransfer({ context: publication.context, db: receiver.db, groupKey,
      staging: failReceiverHandoff(createDesktopFramedSyncStaging(receiver.db), boundary),
      stream: { ...body, frames: wireFrames(body.frames) } })).rejects.toThrow('injected_receiver_handoff');
    expect(sqlite.prepare('SELECT state FROM framed_sync_inbound_transfers').pluck().all()).toEqual(['proposed']);
    for (const table of ['nodes', 'node_sync_versions', 'framed_sync_receipts', 'framed_sync_resource_pins',
      'framed_sync_inbound_frames', 'framed_sync_resource_blob_chunks']) {
      expect(sqlite.prepare(`SELECT count(*) FROM ${table}`).pluck().get()).toBe(0);
    }
    const restarted = await reopen(sqlite, path.join(source.root, 'receiver-restarted.sqlite'));
    sqlite = restarted.sqlite;
    const proposal = (await restarted.staging.loadInboundProposal(publication.transferId))!;
    expect(proposal.context).toEqual(publication.context);
    for (const changed of [{ receiverLibraryEpoch: 'different-epoch' }, { senderDeviceId: 'different-device' }]) {
      await expect(restarted.staging.admitInboundProposal({ ...proposal,
        context: { ...publication.context, ...changed } })).rejects.toThrow('inbound_proposal_conflict');
    }
    const receipts = [];
    for (let retry = 0; retry < 2; retry += 1) {
      const replay = await loadDesktopFramedSyncPreparedTransferBody({ publication, attempt: delivery.attempt,
        staging: source.staging });
      try {
        const response = await receiveDesktopFramedSyncTransfer({ ...restarted, context: publication.context,
          groupKey, stream: { ...replay, frames: wireFrames(replay.frames) } });
        try {
          receipts.push(await readReceipt({ groupKey, published: { ...publication, factCount: 1n, blobCount: 1n,
            totalBlobBytes: BigInt(source.bytes.length) }, stream: { ...response, frames: wireFrames(response.frames) } }));
        } finally { await response.dispose?.(); }
      } finally { await replay.dispose?.(); }
    }
    expect(receipts[0]).toEqual(receipts[1]);
    expect(receipts[0]!.transferId).toEqual(publication.transferId);
    expect(receipts[0]!.appliedStateHash).toEqual(publication.contentId);
    expect(sqlite.prepare('SELECT count(*) FROM framed_sync_receipts').pluck().get()).toBe(1);
    expect(sqlite.prepare('SELECT count(*) FROM framed_sync_resource_pins').pluck().get()).toBe(0);
    expect(await readFile(path.join(assetsDir, source.resource.storageKey))).toEqual(source.bytes);
  } finally {
    await body?.dispose?.();
    source.sqlite.close();
    sqlite.close();
    clearAttachmentLibraryPathSnapshot();
    await rm(source.root, { recursive: true, force: true });
  }
});
