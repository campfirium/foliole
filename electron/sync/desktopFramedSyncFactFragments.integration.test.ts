// @vitest-environment node
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { canonicalContentId, canonicalTransferId } from '../../lib/core/sync/framedSyncCanonicalManifest.js';
import { decodeFrameHeader } from '../../lib/core/sync/framedSyncFraming.js';
import { stageFramedSyncFrozenBody } from '../../lib/core/sync/framedSyncFrozenBody.js';
import { projectFramedSyncNodeRecord } from '../../lib/core/sync/framedSyncNodeProjection.js';
import { loadCurrentSyncNodeRecord } from '../../lib/core/sync/syncNodeGraph.js';
import { clearAttachmentLibraryPathSnapshot, publishAttachmentLibraryPathSnapshot }
  from '../attachments/attachmentLibraryPathSnapshot.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';
import { createDesktopFramedSyncStaging } from '../database/desktopFramedSyncStaging.js';
import { textBranch, textDevice } from '../database/topicTextState.testSupport.js';

import { loadDesktopFramedSyncPreparedTransferBody } from './desktopFramedSyncPreparedTransferBody.js';
import { prepareDesktopFramedSyncPublishedDelivery } from './desktopFramedSyncProcessOutbound.js';
import { readReceipt } from './desktopFramedSyncProcessReceipt.js';
import { receiveDesktopFramedSyncTransfer } from './desktopFramedSyncProcessReceiver.js';
import { loadDesktopFramedSyncReadySource, loadDesktopFramedSyncReadySourceFact } from './desktopFramedSyncReadySource.js';
import type { FramedSyncEncodedFrame } from './desktopFramedSyncStream.js';

async function* wireFrames(frames: AsyncIterable<FramedSyncEncodedFrame>, observed?: number[]) {
  for await (const frame of frames) {
    const header = decodeFrameHeader(frame.headerBytes);
    if (header.frameType === 3) observed?.push(frame.ciphertext.byteLength);
    yield { ...frame, header };
  }
}

const groupKey = new Uint8Array(32).fill(5);

async function prepareLargeFact(source: ReturnType<typeof textDevice>) {
  const record = textBranch('large-version', '\ufeff原正文😀\0tail');
  record.snapshot.title = 'T'.repeat(1_048_576);
  record.snapshot.opening_text = 'O'.repeat(1_048_576);
  const { manifest } = projectFramedSyncNodeRecord(record, []);
  for (const blob of manifest.blobs) await stageFramedSyncFrozenBody(source.db, blob, new TextEncoder().encode(record.body_text!));
  const context = { groupId: 'group', protocolVersion: 22 as const, senderDeviceId: 'sender', senderLibraryEpoch: 's',
    receiverDeviceId: 'receiver', receiverLibraryEpoch: 'r' };
  const contentId = await canonicalContentId(manifest);
  const publication = { context, manifest, contentId, manifestHash: contentId,
    transferId: await canonicalTransferId(context, contentId) };
  const staging = createDesktopFramedSyncStaging(source.db);
  await staging.publishOutbound(publication);
  const delivery = await prepareDesktopFramedSyncPublishedDelivery({ db: source.db, staging, publication,
    groupSecret: Buffer.from(groupKey).toString('base64url') });
  return { record, manifest, context, publication, staging, delivery };
}

it('delivers a legal oversized structured fact, restores ready after SQLite restart and replays one receipt', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'foliole-fact-fragments-'));
  publishAttachmentLibraryPathSnapshot({ assetsDir: path.join(root, 'Assets'), libraryScope: root });
  const source = textDevice();
  const receiver = textDevice();
  let sqlite = receiver.sqlite;
  const bodies: { dispose?: () => Promise<void> }[] = [];
  try {
    const { record, manifest, context, publication, staging, delivery } = await prepareLargeFact(source);
    bodies.push(delivery.body);
    const observed: number[] = [];
    sqlite.exec(`CREATE TEMP TRIGGER fail_receipt BEFORE INSERT ON framed_sync_receipts
      BEGIN SELECT RAISE(ABORT, 'receipt_boundary_failure'); END`);
    await expect(receiveDesktopFramedSyncTransfer({ db: receiver.db, context, groupKey,
      staging: createDesktopFramedSyncStaging(receiver.db), stream: { ...delivery.body, frames: wireFrames(delivery.body.frames, observed) } }))
      .rejects.toThrow('receipt_boundary_failure');
    expect(observed.length).toBeGreaterThan(1);
    expect(Math.max(...observed)).toBeLessThan(2 * 1024 * 1024);
    expect(sqlite.prepare('SELECT state FROM framed_sync_inbound_transfers').pluck().get()).toBe('ready_to_apply');
    expect(sqlite.prepare('SELECT count(*) FROM nodes').pluck().get()).toBe(0);
    const filename = path.join(root, 'receiver.sqlite');
    await sqlite.backup(filename);
    sqlite.close();
    sqlite = new Database(filename);
    const db = createBetterSqliteDbPort(sqlite);
    const ready = await loadDesktopFramedSyncReadySource(db, publication);
    expect(ready?.entries).toHaveLength(manifest.facts.length);
    expect(await loadDesktopFramedSyncReadySourceFact(db, ready!, ready!.entries[0]!.sequence)).toEqual(manifest.facts[0]);
    const receipts = [];
    for (let retry = 0; retry < 2; retry += 1) {
      const replay = await loadDesktopFramedSyncPreparedTransferBody({ publication, attempt: delivery.attempt, staging });
      bodies.push(replay);
      const response = await receiveDesktopFramedSyncTransfer({ db, context, groupKey,
        staging: createDesktopFramedSyncStaging(db), stream: { ...replay, frames: wireFrames(replay.frames) } });
      bodies.push(response);
      receipts.push(await readReceipt({ groupKey, published: { ...publication, factCount: BigInt(manifest.facts.length),
        blobCount: BigInt(manifest.blobs.length), totalBlobBytes: manifest.blobs.reduce((n, blob) => n + blob.byteLength, 0n) },
      stream: { ...response, frames: wireFrames(response.frames) } }));
    }
    expect(receipts[0]).toEqual(receipts[1]);
    expect(receipts[0]?.transferId).toEqual(publication.transferId);
    expect(sqlite.prepare('SELECT count(*) FROM framed_sync_receipts').pluck().get()).toBe(1);
    const actual = await loadCurrentSyncNodeRecord(db, 'topic');
    expect(actual?.body_text).toBe(record.body_text);
    expect(actual?.snapshot.title).toBe(record.snapshot.title);
    expect(actual?.snapshot.opening_text).toBe(record.snapshot.opening_text);
    expect(actual?.version_id).toBe(record.version_id);
  } finally {
    await Promise.all(bodies.map(body => body.dispose?.()));
    source.sqlite.close();
    sqlite.close();
    clearAttachmentLibraryPathSnapshot();
    await rm(root, { recursive: true, force: true });
  }
});
