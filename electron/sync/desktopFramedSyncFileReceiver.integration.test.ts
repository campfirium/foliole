// @vitest-environment node
import { afterEach, expect, it } from 'vitest';

import { createFramedSyncFileStaging } from '../../lib/core/sync/framedSyncFileStaging.js';
import { decodeFrameHeader } from '../../lib/core/sync/framedSyncFraming.js';
import { compareFramedSyncInventories } from '../../lib/core/sync/framedSyncInventory.js';
import { readFramedSyncInventoryEntry } from '../../lib/core/sync/framedSyncInventoryRead.js';
import { publishDesktopFramedSyncNodeOutbound } from '../database/desktopFramedSyncOutboundSelection.js';
import { textBranch, textDevice } from '../database/topicTextState.testSupport.js';

import { fileInboundFixture } from './desktopFramedSyncFileInbound.testSupport.js';
import { createDesktopFramedSyncFiles } from './desktopFramedSyncFiles.js';
import { loadDesktopFramedSyncPreparedTransferBody } from './desktopFramedSyncPreparedTransferBody.js';
import { prepareDesktopFramedSyncPublishedTransfer } from './desktopFramedSyncProcessOutbound.js';
import { readReceipt } from './desktopFramedSyncProcessReceipt.js';
import { receiveVerifiedDesktopFramedSyncTransfer } from './desktopFramedSyncVerifiedReceiver.js';

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup(); });

it('receives encrypted file frames through the existing receiver and replays its file receipt', async () => {
  const source = await fileInboundFixture(textBranch('received-version', 'Received body'));
  const target = textDevice();
  cleanups.push(async () => { target.sqlite.close(); await source.close(); });
  const files = createDesktopFramedSyncFiles(`${source.root}/wire-receiver`);
  const staging = createFramedSyncFileStaging(files);
  const groupKey = new Uint8Array(32).fill(1);
  const receive = () => receiveVerifiedDesktopFramedSyncTransfer({ db: target.db, files, staging, groupKey,
    context: source.published.context, stream: { preamble: source.attempt.preamble, frames: (async function* () {
      for await (const frame of source.sender.streamReplayableFrames(source.published.transferId, source.attempt.attemptId)) {
        yield { headerBytes: frame.frameHeader, ciphertext: frame.ciphertext, header: decodeFrameHeader(frame.frameHeader) };
      }
    })() } });
  const first = await receive();
  const receipt = await readReceipt({ groupKey, published: source.published,
    stream: { preamble: first.preamble, frames: (async function* () {
      for await (const frame of first.frames) yield { ...frame, header: decodeFrameHeader(frame.headerBytes) };
    })() } });
  expect((await target.current()).body_text).toBe('Received body');
  const again = await receive();
  expect(again.preamble).toEqual(first.preamble);
  await again.dispose();
  await source.sender.commitOutboundReceipt(receipt);
  await source.sender.releaseOutboundHolds(receipt.transferId);
  for (const table of ['framed_sync_inbound_transfers', 'framed_sync_inbound_frames', 'framed_sync_outbound_attempts',
    'framed_sync_outbound_frames', 'framed_sync_receipts', 'framed_sync_available_blobs']) {
    expect(target.sqlite.prepare(`SELECT count(*) FROM ${table}`).pluck().get()).toBe(0);
  }
});

it('publishes from unchanged inventory selection and sends frozen file content after a later edit', async () => {
  const fixture = await fileInboundFixture(textBranch('fixture', 'Fixture'));
  const source = textDevice();
  const target = textDevice();
  cleanups.push(async () => { source.sqlite.close(); target.sqlite.close(); await fixture.close(); });
  const original = textBranch('frozen', 'Frozen original');
  await source.receive([original]);
  const files = createDesktopFramedSyncFiles(`${fixture.root}/selected-sender`);
  const staging = createFramedSyncFileStaging(files);
  const inventory = await readFramedSyncInventoryEntry(source.db, { globalId: 'topic', objectType: 'node' });
  const difference = compareFramedSyncInventories({ local: [inventory!], remote: [] })[0]!;
  const selected = await publishDesktopFramedSyncNodeOutbound({ port: source.db, files, difference,
    context: fixture.published.context, readCurrentInventoryEntry: readFramedSyncInventoryEntry });
  if (selected.kind !== 'published') throw new Error('fixture_selection_deferred');
  await source.receive([textBranch('edited', 'Later edited body', original)]);
  const groupKey = new Uint8Array(32).fill(1);
  const input = { db: source.db, files, staging, publication: selected.publication,
    groupSecret: Buffer.from(groupKey).toString('base64url') };
  const attempt = await prepareDesktopFramedSyncPublishedTransfer(input);
  const body = await loadDesktopFramedSyncPreparedTransferBody({ ...input, attempt });
  const receiverFiles = createDesktopFramedSyncFiles(`${fixture.root}/selected-receiver`);
  try {
    const response = await receiveVerifiedDesktopFramedSyncTransfer({ db: target.db, files: receiverFiles,
      staging: createFramedSyncFileStaging(receiverFiles), groupKey, context: selected.publication.context,
      stream: { preamble: body.preamble, frames: (async function* () {
        for await (const frame of body.frames) yield { ...frame, header: decodeFrameHeader(frame.headerBytes) };
      })() } });
    await response.dispose();
    expect((await target.current()).body_text).toBe('Frozen original');
    expect((await source.current()).body_text).toBe('Later edited body');
    for (const host of [source, target]) for (const table of ['framed_sync_outbound_publications',
      'framed_sync_outbound_frames', 'framed_sync_inbound_transfers', 'framed_sync_receipts', 'framed_sync_available_blobs']) {
      expect(host.sqlite.prepare(`SELECT count(*) FROM ${table}`).pluck().get()).toBe(0);
    }
  } finally { await body.dispose?.(); }
});
