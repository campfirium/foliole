// @vitest-environment node
import { bytesToHex } from '@noble/hashes/utils.js';
import { afterEach, expect, it } from 'vitest';

import { FRAMED_SYNC_RECEIPT_RETENTION_MS } from '../../lib/core/sync/framedSyncCompletionRetention.js';
import { loadFramedSyncFileBody } from '../../lib/core/sync/framedSyncFileBodies.js';
import { expireFramedSyncFileCompletions } from '../../lib/core/sync/framedSyncFileCompletionRetention.js';
import { readFramedSyncFileInbound } from '../../lib/core/sync/framedSyncFileInboundRecord.js';
import { encodeFramedSyncFileJson } from '../../lib/core/sync/framedSyncFilePort.js';
import { discardFramedSyncFilePreparations } from '../../lib/core/sync/framedSyncFilePreparation.js';
import { framedSyncPublicationKey, loadFramedSyncFileTask } from '../../lib/core/sync/framedSyncFilePublication.js';
import { createFramedSyncFileSessionNoncePort } from '../../lib/core/sync/framedSyncFileSession.js';
import { textBranch, textDevice } from '../database/topicTextState.testSupport.js';

import { fileInboundFixture } from './desktopFramedSyncFileInbound.testSupport.js';
import { createDesktopFramedSyncFiles } from './desktopFramedSyncFiles.js';
import { buildReceiptStream, readReceipt } from './desktopFramedSyncProcessReceipt.js';

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup(); });

async function fixture() {
  const input = await fileInboundFixture(textBranch('retention-version', 'Retained body'));
  cleanups.push(input.close);
  const senderFiles = createDesktopFramedSyncFiles(`${input.root}/sender`);
  return { ...input, senderFiles };
}

it('keeps old unfinished work, releases confirmed payload immediately, and expires only completion records', async () => {
  const input = await fixture();
  const { transferId, contentId, manifest } = input.published;
  const future = Date.now() + FRAMED_SYNC_RECEIPT_RETENTION_MS * 2;
  expect(await expireFramedSyncFileCompletions(input.senderFiles, future)).toBe(0);
  expect(await expireFramedSyncFileCompletions(input.files, future)).toBe(0);
  expect(await loadFramedSyncFileBody(input.senderFiles, manifest.blobs[0]!)).toBeTruthy();
  const receipt = { transferId, contentId, receiverDeviceId: 'receiver', receiverLibraryEpoch: 'r',
    appliedStateHash: new Uint8Array(32).fill(2) };
  await input.sender.commitOutboundReceipt(receipt);
  await input.staging.commitApplyAndReceipt(receipt);
  expect(await expireFramedSyncFileCompletions(input.senderFiles)).toBe(0);
  expect(await expireFramedSyncFileCompletions(input.files)).toBe(0);
  expect(await input.staging.loadReceipt(transferId)).toEqual(receipt);
  expect((await loadFramedSyncFileTask(input.senderFiles, transferId))?.state).toBe('retired');
  await expect(loadFramedSyncFileBody(input.senderFiles, manifest.blobs[0]!)).rejects.toThrow('published_body_unavailable');
  expect(await expireFramedSyncFileCompletions(input.senderFiles, future)).toBe(1);
  expect(await expireFramedSyncFileCompletions(input.files, future)).toBe(1);
  expect(await loadFramedSyncFileTask(input.senderFiles, transferId)).toBeNull();
  expect(await readFramedSyncFileInbound(input.files, transferId)).toBeNull();
});

it('discards interrupted preparations without releasing a sealed publication owner', async () => {
  const { senderFiles: files, published } = await fixture();
  const publicationKey = framedSyncPublicationKey(published.transferId);
  const preparingKey = `outbound/${bytesToHex(published.transferId)}/preparing.json`;
  const sealed = await files.read(publicationKey);
  await files.write(preparingKey, sealed!);
  await discardFramedSyncFilePreparations(files);
  expect(await files.read(preparingKey)).toBeNull();
  expect(await loadFramedSyncFileBody(files, published.manifest.blobs[0]!)).toBeTruthy();
  await files.write(preparingKey, sealed!);
  await files.remove(publicationKey);
  await discardFramedSyncFilePreparations(files);
  expect(await files.read(preparingKey)).toBeNull();
  await expect(loadFramedSyncFileBody(files, published.manifest.blobs[0]!)).rejects.toThrow('published_body_unavailable');
});

it('preserves session nonce identity across reopening and rejects reuse with changed encryption context', async () => {
  const { senderFiles: files, root } = await fixture();
  const state = { sessionId: new Uint8Array(16).fill(3), contextId: new Uint8Array(32).fill(4),
    noncePrefix: new Uint8Array(4).fill(5), startingSequence: 0n as const };
  expect(await createFramedSyncFileSessionNoncePort(files).persistBeforeEncryption(state)).toBe('created');
  const reopened = createFramedSyncFileSessionNoncePort(createDesktopFramedSyncFiles(`${root}/sender`));
  expect(await reopened.persistBeforeEncryption(state)).toBe('identical');
  await expect(reopened.persistBeforeEncryption({ ...state, contextId: new Uint8Array(32).fill(6) }))
    .rejects.toThrow('session_send_state_conflict');
  await reopened.abandon(state.sessionId);
  expect(await files.read(`sessions/${bytesToHex(state.sessionId)}.json`))
    .toEqual(encodeFramedSyncFileJson({ ...state, state: 'abandoned' }));
});

it('waits for an active receipt to be built before expiring its durable files', async () => {
  const input = await fixture();
  const host = textDevice();
  cleanups.push(async () => { host.sqlite.close(); });
  const receipt = { transferId: input.published.transferId, contentId: input.published.contentId,
    receiverDeviceId: 'receiver', receiverLibraryEpoch: 'r', appliedStateHash: new Uint8Array(32).fill(7) };
  await input.staging.commitApplyAndReceipt(receipt);
  const key = `receiver/${bytesToHex(receipt.transferId)}`;
  let begin!: () => void;
  let release!: () => void;
  let attempted!: () => void;
  const entered = new Promise<void>(resolve => { begin = resolve; });
  const resume = new Promise<void>(resolve => { release = resolve; });
  const waiting = new Promise<void>(resolve => { attempted = resolve; });
  const groupKey = new Uint8Array(32).fill(1);
  const receiving = input.files.exclusive(key, async () => {
    begin();
    await resume;
    return buildReceiptStream({ db: host.db, files: input.files, staging: input.staging, groupKey, receipt });
  });
  await entered;
  const expiring = expireFramedSyncFileCompletions({ ...input.files, exclusive(lock, execute) {
    if (lock === key) attempted();
    return input.files.exclusive(lock, execute);
  } }, Date.now() + FRAMED_SYNC_RECEIPT_RETENTION_MS * 2);
  try {
    await waiting;
    expect(await input.staging.loadReceipt(receipt.transferId)).toEqual(receipt);
  } finally { release(); }
  const body = await receiving;
  expect(await expiring).toBe(1);
  expect(await input.staging.loadReceipt(receipt.transferId)).toBeNull();
  expect(await readReceipt({ groupKey, published: input.published, stream: body })).toEqual(receipt);
});
