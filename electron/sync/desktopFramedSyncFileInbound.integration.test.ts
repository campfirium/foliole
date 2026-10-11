// @vitest-environment node
import { afterEach, expect, it } from 'vitest';

import { applyFramedFactSources } from '../../lib/core/sync/framedSyncFactApply.js';
import { loadFramedSyncFileInboundBody } from '../../lib/core/sync/framedSyncFileInboundBodies.js';
import { readFramedSyncFileInbound } from '../../lib/core/sync/framedSyncFileInboundRecord.js';
import { streamFramedSyncFileFacts } from '../../lib/core/sync/framedSyncFileReadyFacts.js';
import { createFramedSyncFileStaging } from '../../lib/core/sync/framedSyncFileStaging.js';
import { readFramedSyncInventoryEntry } from '../../lib/core/sync/framedSyncInventoryRead.js';
import { applyCompanionFramedSyncFileTransfers } from '../../src/shared/platform/companion/sync/framed/companionFramedSyncFileApply.js';
import { textBranch, textDevice } from '../database/topicTextState.testSupport.js';

import { recordDesktopFramedSourceProgress } from './desktopFramedSyncApplyLifecycle.js';
import { applyDesktopFramedSyncFileInbound } from './desktopFramedSyncFileApply.js';
import { fileInboundFixture } from './desktopFramedSyncFileInbound.testSupport.js';
import { loadDesktopFramedSyncFileReadySource } from './desktopFramedSyncFileReadySource.js';
import { createDesktopFramedSyncFiles } from './desktopFramedSyncFiles.js';

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup(); });

it('applies the same durable files through the companion business path and recovers a missing receipt', async () => {
  const input = await fileInboundFixture(textBranch('companion-version', 'Companion file body'));
  const host = textDevice();
  cleanups.push(async () => { host.sqlite.close(); await input.close(); });
  const transfer = { ...input.published.context, transferId: input.published.transferId };
  const interrupted = { ...input.files, async write(key: string, bytes: Uint8Array) {
    if (key.endsWith('/transfer.json') && new TextDecoder().decode(bytes).includes('"state":"applied"')) {
      expect(host.sqlite.inTransaction).toBe(false);
      throw new Error('companion_receipt_interrupted');
    }
    await input.files.write(key, bytes);
  } };
  await expect(applyCompanionFramedSyncFileTransfers(host.db, interrupted, [transfer]))
    .rejects.toThrow('companion_receipt_interrupted');
  expect((await host.current()).body_text).toBe('Companion file body');
  const before = host.sqlite.prepare('SELECT version_id FROM node_sync_versions ORDER BY version_id').all();
  const receipts = await applyCompanionFramedSyncFileTransfers(host.db, input.files, [transfer]);
  expect(await applyCompanionFramedSyncFileTransfers(host.db, input.files, [transfer])).toEqual(receipts);
  expect(host.sqlite.prepare('SELECT version_id FROM node_sync_versions ORDER BY version_id').all()).toEqual(before);
  expect(host.sqlite.prepare('SELECT count(*) FROM framed_sync_receipts').pluck().get()).toBe(0);
});

it('recovers file input after business commit without a file receipt or duplicate business versions', async () => {
  const input = await fileInboundFixture(textBranch('version', 'Original body'));
  const host = textDevice();
  cleanups.push(async () => { host.sqlite.close(); await input.close(); });
  const apply = async () => host.db.transaction(async (tx) => {
    await applyFramedFactSources(tx, [async function* () {
      for await (const { fact } of streamFramedSyncFileFacts(input.files, {
        transferId: input.published.transferId, attemptId: input.attempt.attemptId
      })) yield fact;
    }], { loadBody: (_db, blob) => loadFramedSyncFileInboundBody(input.files, { transferId: input.published.transferId, attemptId: input.attempt.attemptId }, blob) });
    await recordDesktopFramedSourceProgress(tx, [{ ...input.published, globalId: 'topic', objectType: 'node' }]);
  });
  await apply();
  expect(await input.staging.loadReceipt(input.published.transferId)).toBeNull();
  const before = host.sqlite.prepare('SELECT version_id, content_hash FROM node_sync_versions ORDER BY version_id').all();
  await apply();
  expect(host.sqlite.prepare('SELECT version_id, content_hash FROM node_sync_versions ORDER BY version_id').all()).toEqual(before);
  const inventory = await readFramedSyncInventoryEntry(host.db, { globalId: 'topic', objectType: 'node' });
  expect(inventory).not.toBeNull();
  const reopened = createFramedSyncFileStaging(createDesktopFramedSyncFiles(`${input.root}/receiver`));
  const receipt = await reopened.commitApplyAndReceipt({ transferId: input.published.transferId, contentId: input.published.contentId,
    receiverDeviceId: 'receiver', receiverLibraryEpoch: 'r', appliedStateHash: inventory!.sharedStateHash });
  expect(await reopened.loadReceipt(input.published.transferId)).toEqual(receipt);
  await reopened.releasePins(input.published.transferId, 'business_reference_committed');
  expect((await readFramedSyncFileInbound(input.files, input.published.transferId))?.state).toBe('applied');
  for (const table of ['framed_sync_outbound_publications', 'framed_sync_inbound_transfers', 'framed_sync_inbound_frames',
    'framed_sync_receipts', 'framed_sync_blob_pins', 'framed_sync_available_blobs']) {
    expect(host.sqlite.prepare(`SELECT count(*) FROM ${table}`).pluck().get()).toBe(0);
  }
  expect((await host.current()).body_text).toBe('Original body');
});

it('commits business changes before the file receipt and recovers a failed receipt write', async () => {
  const input = await fileInboundFixture(textBranch('committed-version', 'Committed body'));
  const host = textDevice();
  cleanups.push(async () => { host.sqlite.close(); await input.close(); });
  const source = await loadDesktopFramedSyncFileReadySource(input.files, input.published);
  expect(source).not.toBeNull();
  const interrupted = { ...input.files, async write(key: string, bytes: Uint8Array) {
    if (key.endsWith('/transfer.json') && new TextDecoder().decode(bytes).includes('"state":"applied"')) {
      expect(host.sqlite.inTransaction).toBe(false);
      throw new Error('receipt_write_interrupted');
    }
    await input.files.write(key, bytes);
  } };
  await expect(applyDesktopFramedSyncFileInbound({ db: host.db, files: interrupted, transfers: [source!] }))
    .rejects.toThrow('receipt_write_interrupted');
  expect((await host.current()).body_text).toBe('Committed body');
  expect(await input.staging.loadReceipt(source!.transferId)).toBeNull();
  const versions = host.sqlite.prepare('SELECT version_id FROM node_sync_versions ORDER BY version_id').all();
  const files = createDesktopFramedSyncFiles(`${input.root}/receiver`);
  const recovered = await loadDesktopFramedSyncFileReadySource(files, input.published);
  const result = await applyDesktopFramedSyncFileInbound({ db: host.db, files, transfers: [recovered!] });
  expect(result.receipts).toHaveLength(1);
  expect(host.sqlite.prepare('SELECT version_id FROM node_sync_versions ORDER BY version_id').all()).toEqual(versions);
  expect(await createFramedSyncFileStaging(files).loadReceipt(source!.transferId)).toEqual(result.receipts[0]);
  expect(host.sqlite.prepare('SELECT count(*) FROM framed_sync_receipts').pluck().get()).toBe(0);
});
