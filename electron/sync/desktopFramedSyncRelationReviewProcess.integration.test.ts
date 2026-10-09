// @vitest-environment node
import { promises as fs } from 'node:fs';

import { afterEach, expect, it } from 'vitest';

import {
  canonicalContentId,
  canonicalTransferId
} from '../../lib/core/sync/framedSyncCanonicalManifest.js';
import {
  FRAMED_SYNC_PROTOCOL_VERSION,
  type FramedSyncContext,
  type PublishedTransfer
} from '../../lib/core/sync/framedSyncContract.js';
import { buildFramedSyncTransferPayloads } from '../../lib/core/sync/framedSyncTransferPayloads.js';

import { postDesktopFramedSync } from './desktopFramedSyncHttp.js';
import { readReceipt } from './desktopFramedSyncProcessReceipt.js';
import {
  encryptProtocolFrame,
  newTransferAttempt,
  processFrameStream
} from './desktopFramedSyncProcessWire.js';
import { projectDesktopFramedSyncReview } from './desktopFramedSyncRelationReviewProjection.js';
import { framedSyncEncodedLength, framedSyncEncodedSha256 } from './desktopFramedSyncStream.js';
import {
  createDesktopFramedSyncTwoProcessFixture,
  type DesktopFramedSyncFixtureProcess,
  readDesktopFramedSyncLibraryEvidence
} from './desktopFramedSyncTwoProcess.testSupport.js';

let root = '';
const processes: DesktopFramedSyncFixtureProcess[] = [];

afterEach(async ({ task }) => {
  const active = processes.splice(0);
  await Promise.allSettled(active.map((process) => process.close()));
  if (!root) return;
  if (task.result?.state === 'fail') {
    await fs.writeFile(`${root}/processes.log`, active.map((process, index) =>
      `Process ${index + 1}\n${process.diagnostics()}`).join('\n'));
    console.info('Failed framed-sync relation/review fixture:', root);
  } else {
    await fs.rm(root, { force: true, recursive: true });
  }
  root = '';
});

async function setup() {
  const fixture = await createDesktopFramedSyncTwoProcessFixture();
  root = fixture.root;
  processes.push(fixture.left, fixture.right);
  return fixture;
}

async function postReviewOnly(peerOrigin: string) {
  const context: FramedSyncContext = {
    groupId: 't326-group', protocolVersion: FRAMED_SYNC_PROTOCOL_VERSION,
    receiverDeviceId: 'desktop-b', receiverLibraryEpoch: 'desktop-b-epoch',
    senderDeviceId: 'desktop-a', senderLibraryEpoch: 'desktop-a-epoch'
  };
  const fact = projectDesktopFramedSyncReview({
    difficulty_after: 3.75, difficulty_before: 2.25,
    due_after: '2026-10-08T00:00:00.000Z', due_before: '2026-10-06T00:00:00.000Z',
    grade: 3, host_name: 'desktop-a', id: 't326-review-only-row',
    node_id: 't326-relation-review', op_id: 't326-review-only-op',
    reviewed_at: '2026-10-05T02:00:00.000Z', scheduler_version: 'fsrs-6',
    stability_after: 4.5, stability_before: 2.5
  });
  const manifest = { blobs: [], facts: [fact] };
  const contentId = await canonicalContentId(manifest);
  const transferId = await canonicalTransferId(context, contentId);
  const published: PublishedTransfer = {
    blobCount: 0n, contentId, context, factCount: 1n, manifestHash: contentId,
    totalBlobBytes: 0n, transferId
  };
  const attempt = newTransferAttempt(transferId);
  const groupKey = new Uint8Array(Buffer.alloc(32, 7));
  const payloads = buildFramedSyncTransferPayloads({
    attemptId: attempt.attemptId, blobContents: [], manifest, published
  });
  const frames = await Promise.all(payloads.map((payload, index) => encryptProtocolFrame({
    attempt, frameType: payload.frameType, groupKey, payload: payload.payload,
    payloadCase: payload.payloadCase, sequence: BigInt(index), transferId
  })));
  const response = await postDesktopFramedSync({
    body: {
      bodySha256: framedSyncEncodedSha256(attempt.preamble, frames),
      contentLength: framedSyncEncodedLength(attempt.preamble, frames),
      frames: processFrameStream(frames), preamble: attempt.preamble
    },
    endpointUrl: peerOrigin, groupId: 't326-group', localDeviceId: 'desktop-a',
    localLibraryEpoch: 'desktop-a-epoch', pathWithQuery: '/companion/framed-sync',
    remoteDeviceId: 'desktop-b', remoteLibraryEpoch: 'desktop-b-epoch',
    secret: Buffer.alloc(32, 7).toString('base64url')
  });
  return readReceipt({ groupKey, published, stream: response.stream });
}

it('applies a node, parent relation, review, and receipt through one production transfer', async () => {
  const fixture = await setup();
  await Promise.all([
    fixture.left.seedRelationReview('sender'),
    fixture.right.seedRelationReview('receiver')
  ]);
  await fixture.left.synchronize(fixture.rightSnapshot.origin, 't326-relation-review');

  const received = readDesktopFramedSyncLibraryEvidence(fixture.rightSnapshot.databasePath);
  expect(received.nodes).toEqual([expect.objectContaining({
    current_version_id: 't326-child-version', id: 't326-relation-review'
  })]);
  expect(received.parents).toEqual([{
    ordinal: 0, parent_version_id: 't326-base-version', version_id: 't326-child-version'
  }]);
  expect(received.reviews).toEqual([{
    grade: 3, node_id: 't326-relation-review', op_id: 't326-review-op'
  }]);
  expect(received.framedSync).toMatchObject({
    inboundFacts: 0, inboundFrames: 0, inboundStates: [{ state: 'applied' }], receipts: 1
  });
});

it('rolls back node and relation apply and writes no receipt when a review conflicts', async () => {
  const fixture = await setup();
  await Promise.all([
    fixture.left.seedRelationReview('sender'),
    fixture.right.seedRelationReview('receiver_conflict')
  ]);
  await expect(fixture.left.synchronize(
    fixture.rightSnapshot.origin, 't326-relation-review'
  )).rejects.toThrow();

  const received = readDesktopFramedSyncLibraryEvidence(fixture.rightSnapshot.databasePath);
  expect(received.nodes).toEqual([expect.objectContaining({
    current_version_id: 't326-base-version', id: 't326-relation-review'
  })]);
  expect(received.versions).toEqual([
    expect.objectContaining({ version_id: 't326-base-version' })
  ]);
  expect(received.parents).toEqual([]);
  expect(received.reviews).toEqual([{
    grade: 4, node_id: 't326-relation-review', op_id: 't326-review-op'
  }]);
  expect(received.framedSync.receipts).toBe(0);
});

it('applies a review-only zero-blob transfer and commits its receipt atomically', async () => {
  const fixture = await setup();
  await fixture.right.seedRelationReview('receiver');

  const receipt = await postReviewOnly(fixture.rightSnapshot.origin);

  expect(receipt.appliedStateHash).toHaveLength(32);
  const received = readDesktopFramedSyncLibraryEvidence(fixture.rightSnapshot.databasePath);
  expect(received.reviews).toEqual([{
    grade: 3, node_id: 't326-relation-review', op_id: 't326-review-only-op'
  }]);
  expect(received.framedSync).toMatchObject({
    availableBlobs: 0, inboundFacts: 0, inboundFrames: 0, inboundStates: [{ state: 'applied' }], receipts: 1
  });
});
