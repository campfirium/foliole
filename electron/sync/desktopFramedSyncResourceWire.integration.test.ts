// @vitest-environment node
import { readFile, rm } from 'node:fs/promises';
import path from 'node:path';

import { expect, it } from 'vitest';

import { decodeFrameHeader } from '../../lib/core/sync/framedSyncFraming.js';
import { ensureFramedSyncMissingResourceDemand, obsoleteFramedSyncResourceDemand,
  startFramedSyncResourceDemandRequest } from '../../lib/core/sync/framedSyncResourceDemands.js';
import { restoreFramedSyncResourceFact } from '../../lib/core/sync/framedSyncResourceFact.js';
import { projectFramedSyncResourceRequest, type FramedSyncRequestedResource } from '../../lib/core/sync/framedSyncResourceRequest.js';
import type { InboundFrameInput } from '../../lib/core/sync/framedSyncStagingContract.js';
import { clearAttachmentLibraryPathSnapshot, publishAttachmentLibraryPathSnapshot }
  from '../attachments/attachmentLibraryPathSnapshot.js';
import { createDesktopFramedSyncSessionNoncePort } from '../database/desktopFramedSyncSessionStaging.js';
import { createDesktopFramedSyncStaging } from '../database/desktopFramedSyncStaging.js';
import { textDevice } from '../database/topicTextState.testSupport.js';

import { respondDesktopFramedSyncInventory } from './desktopFramedSyncInventoryHttp.js';
import { loadDesktopFramedSyncPreparedTransferBody } from './desktopFramedSyncPreparedTransferBody.js';
import { prepareDesktopFramedSyncPublishedTransfer } from './desktopFramedSyncProcessOutbound.js';
import { readReceipt } from './desktopFramedSyncProcessReceipt.js';
import { receiveDesktopFramedSyncTransfer } from './desktopFramedSyncProcessReceiver.js';
import { publishDesktopFramedSyncResourceOutbound } from './desktopFramedSyncResourceOutbound.js';
import { desktopResourceReadyFixture } from './desktopFramedSyncResourceReady.testSupport.js';
import { encodeDesktopFramedSyncSession } from './desktopFramedSyncSessionWire.js';
import type { FramedSyncEncodedFrame } from './desktopFramedSyncStream.js';

async function* wireFrames(frames: AsyncIterable<FramedSyncEncodedFrame>, beforeTrailer?: () => Promise<void>) {
  for await (const frame of frames) {
    const header = decodeFrameHeader(frame.headerBytes);
    if (header.frameType === 5) await beforeTrailer?.();
    yield { ...frame, header };
  }
}

function captureResourceFrameCheckpoint(receiver: ReturnType<typeof textDevice>,
  staging: ReturnType<typeof createDesktopFramedSyncStaging>) {
  let lastResourceFrame: InboundFrameInput | undefined;
  const commit = staging.commitAuthenticatedFrame;
  staging.commitAuthenticatedFrame = async (frame) => {
    if (frame.frameType === 4) lastResourceFrame = frame;
    return commit(frame);
  };
  return async (transferId: Uint8Array) => {
    expect(receiver.sqlite.prepare(`SELECT length(authenticated_plaintext) AS bytes
      FROM framed_sync_inbound_frames WHERE transfer_id = ? AND frame_type = 4`)
      .all(transferId)).toEqual([{ bytes: 32 }]);
    expect(receiver.sqlite.prepare(`SELECT count(*) FROM framed_sync_resource_blob_chunks
      WHERE transfer_id = ?`).pluck().get(transferId)).toBe(1);
    if (!lastResourceFrame) throw new Error('fixture_resource_frame_missing');
    expect(await commit(lastResourceFrame)).toBe('identical');
    const changed = lastResourceFrame.authenticatedPlaintext.slice();
    changed[changed.length - 1] = changed[changed.length - 1]! ^ 1;
    await expect(commit({ ...lastResourceFrame, authenticatedPlaintext: changed }))
      .rejects.toThrow('inbound_frame_identity_conflict');
  };
}

function assertOnlyResourceReceipts(receiver: ReturnType<typeof textDevice>) {
  expect(receiver.sqlite.prepare(`SELECT (SELECT count(*) FROM framed_sync_receipts) AS receipts,
      (SELECT count(*) FROM nodes) AS nodes, (SELECT count(*) FROM node_sync_versions) AS versions`)
      .get()).toEqual({ receipts: 2, nodes: 0, versions: 0 });
}

async function assertStartedDemandRemainsPending(receiver: ReturnType<typeof textDevice>, demandId: string) {
  await obsoleteFramedSyncResourceDemand(receiver.db, demandId);
  expect(receiver.sqlite.prepare('SELECT state FROM framed_sync_resource_demands WHERE demand_id = ?')
    .pluck().get(demandId)).toBe('pending');
}

async function requestResourceReply(source: Awaited<ReturnType<typeof desktopResourceReadyFixture>>,
  receiver: ReturnType<typeof textDevice>, demand: FramedSyncRequestedResource, groupKey: Uint8Array) {
  const transfer = source.published.context;
  const context = { groupId: transfer.groupId, protocolVersion: transfer.protocolVersion,
    initiatorDeviceId: transfer.receiverDeviceId, initiatorLibraryEpoch: transfer.receiverLibraryEpoch,
    responderDeviceId: transfer.senderDeviceId, responderLibraryEpoch: transfer.senderLibraryEpoch };
  const request = await encodeDesktopFramedSyncSession({ authenticatedContext: context, groupKey,
    noncePort: createDesktopFramedSyncSessionNoncePort(receiver.db),
    messages: [{ payloadCase: 'difference_request',
      payload: projectFramedSyncResourceRequest([demand], new Uint8Array(16).fill(4)) }] });
  return respondDesktopFramedSyncInventory({ context, db: source.db, groupKey,
    groupSecret: Buffer.from(groupKey).toString('base64url'), staging: source.staging,
    noncePort: createDesktopFramedSyncSessionNoncePort(source.db),
    stream: { ...request, frames: wireFrames(request.frames) } });
}

it('repairs the same attachment after a second loss and replays each demand between independent SQLite instances', async () => {
  const source = await desktopResourceReadyFixture();
  const receiver = textDevice();
  try {
    const groupKey = new Uint8Array(32).fill(5);
    const assetsDir = path.join(source.root, 'receiver', 'Assets');
    const target = path.join(assetsDir, source.resource.storageKey);
    const staging = createDesktopFramedSyncStaging(receiver.db);
    const checkpoint = captureResourceFrameCheckpoint(receiver, staging);
    const generations = [];
    for (const demandId of ['demand-1', 'demand-2']) {
      if (demandId === 'demand-2') await rm(target);
      publishAttachmentLibraryPathSnapshot({ assetsDir: source.assetsDir, libraryScope: source.root });
      const demand = { ...restoreFramedSyncResourceFact(source.fact), demandId,
        storageKey: source.resource.storageKey };
      await ensureFramedSyncMissingResourceDemand(receiver.db,
        { ...source.published.context, ...demand }, () => demandId);
      await startFramedSyncResourceDemandRequest(receiver.db,
        { ...source.published.context, ...demand }, demandId, demand.sharedStateHash);
      const publication = await publishDesktopFramedSyncResourceOutbound({ db: source.db,
        context: source.published.context, resources: [demand] });
      const attempt = await prepareDesktopFramedSyncPublishedTransfer({ db: source.db,
        groupSecret: Buffer.from(groupKey).toString('base64url'), publication, staging: source.staging });
      const reply = await requestResourceReply(source, receiver, demand, groupKey);
      await assertStartedDemandRemainsPending(receiver, demandId);
      publishAttachmentLibraryPathSnapshot({ assetsDir, libraryScope: path.dirname(assetsDir) });
      const published = { ...publication, factCount: 1n, blobCount: 1n,
        totalBlobBytes: BigInt(source.bytes.length) };
      const receipts = [];
      for (let replay = 0; replay < 2; replay += 1) {
        const stream = replay === 0 ? reply
          : await loadDesktopFramedSyncPreparedTransferBody({ attempt, publication, staging: source.staging });
        const response = await receiveDesktopFramedSyncTransfer({ context: publication.context,
          db: receiver.db, groupKey, staging, stream: { ...stream,
            frames: wireFrames(stream.frames, replay === 0
              ? () => checkpoint(publication.transferId) : undefined) } });
        receipts.push(await readReceipt({ groupKey, published,
          stream: { ...response, frames: wireFrames(response.frames) } }));
      }
      expect(receipts[0]).toEqual(receipts[1]);
      expect(receipts[0]!.appliedStateHash).toEqual(publication.contentId);
      expect(await readFile(target)).toEqual(source.bytes);
      generations.push(receipts[0]);
    }
    expect(generations[0]!.transferId).not.toEqual(generations[1]!.transferId);
    assertOnlyResourceReceipts(receiver);
    publishAttachmentLibraryPathSnapshot({ assetsDir: source.assetsDir, libraryScope: source.root });
    await rm(path.join(source.assetsDir, source.resource.storageKey));
    await expect(publishDesktopFramedSyncResourceOutbound({ db: source.db, context: source.published.context,
      resources: [{ ...restoreFramedSyncResourceFact(source.fact), demandId: 'missing-demand',
        storageKey: source.resource.storageKey }] })).rejects.toThrow('framed_sync_resource_source_unavailable');
    expect(source.sqlite.prepare('SELECT count(*) FROM framed_sync_outbound_publications').pluck().get()).toBe(2);
  } finally {
    source.sqlite.close();
    receiver.sqlite.close();
    clearAttachmentLibraryPathSnapshot();
    await rm(source.root, { recursive: true, force: true });
  }
});
