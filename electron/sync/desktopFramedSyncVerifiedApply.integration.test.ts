// @vitest-environment node
import { expect, it } from 'vitest';

import { collectBodyContentCandidates } from '../../lib/core/database/bodyContentCollection.js';
import { loadCurrentVerifiedSyncNode } from '../../lib/core/sync/syncNodeVerifiedGraph.js';
import { readBodyText } from '../../lib/core/sync/verifiedBody.js';

import { loadDesktopFramedSyncReadyFacts } from './desktopFramedSyncReadyFacts.js';
import { applyVerifiedDesktopFramedSyncInbound } from './desktopFramedSyncVerifiedApply.js';
import { verifiedApplyBusinessRows, verifiedApplyReadyRows, verifiedDesktopReadyFixture } from './desktopFramedSyncVerifiedApply.testSupport.js';

it.each(['', '\ufeff中😀\0文'.repeat(350000)])('commits a production node fact and receipt before retiring ready body copies', async (body) => {
  const host = await verifiedDesktopReadyFixture(body);
  try {
    const result = await applyVerifiedDesktopFramedSyncInbound({ db: host.db, transfers: [host.transfer] });
    expect(result.generatedChanges).toBe(false);
    expect(result.receipts).toHaveLength(1);
    expect(result.receipts[0]).toEqual(await host.staging.loadReceipt(host.published.transferId));
    expect(result.receipts[0]).toMatchObject({ transferId: host.published.transferId, contentId: host.published.contentId,
      receiverDeviceId: host.published.context.receiverDeviceId, receiverLibraryEpoch: host.published.context.receiverLibraryEpoch });
    expect(await loadDesktopFramedSyncReadyFacts(host.db, host.published)).toBeNull();
    expect(host.sqlite.prepare('SELECT state, header_json, active_attempt_id FROM framed_sync_inbound_transfers').get())
      .toEqual({ state: 'applied', header_json: null, active_attempt_id: null });
    for (const table of ['framed_sync_blob_pins', 'framed_sync_inbound_attempts', 'framed_sync_inbound_frames',
      'framed_sync_available_blobs', 'framed_sync_available_blob_chunks']) {
      expect(host.sqlite.prepare(`SELECT count(*) FROM ${table}`).pluck().get()).toBe(0);
    }
    const current = await loadCurrentVerifiedSyncNode(host.db, host.record.object_id);
    expect(current?.metadata.version_id).toBe(host.record.version_id);
    expect(current?.metadata.content_hash).toBe(host.record.content_hash);
    if (current?.body.kind !== 'readable') throw new Error('readable_result_required');
    expect(await readBodyText(host.db, current.body.ref)).toBe(body);
    expect(await collectBodyContentCandidates(host.db, [current.body.ref.hash])).toMatchObject({ deletedHashes: [] });
    expect(await readBodyText(host.db, current.body.ref)).toBe(body);
    expect(host.sqlite.prepare('SELECT count(*) FROM node_version_local_source_revisions WHERE source_device_identity_key = ?')
      .pluck().get(host.published.context.senderDeviceId)).toBe(1);
  } finally { host.sqlite.close(); }
});

it('rolls back all business effects on receipt failure while retaining durable ready and pins for retry', async () => {
  const body = '\ufeff中😀\0文'.repeat(350000);
  const host = await verifiedDesktopReadyFixture(body);
  try {
    const beforeBusiness = verifiedApplyBusinessRows(host);
    const beforeReady = verifiedApplyReadyRows(host);
    host.sqlite.exec(`CREATE TRIGGER reject_verified_receipt BEFORE INSERT ON framed_sync_receipts
      BEGIN SELECT RAISE(ABORT, 'verified_receipt_rejected'); END`);
    await expect(applyVerifiedDesktopFramedSyncInbound({ db: host.db, transfers: [host.transfer] }))
      .rejects.toThrow('verified_receipt_rejected');
    expect(verifiedApplyBusinessRows(host)).toEqual(beforeBusiness);
    expect(verifiedApplyReadyRows(host)).toEqual(beforeReady);
    expect(await host.staging.loadReceipt(host.published.transferId)).toBeNull();
    const retry = await loadDesktopFramedSyncReadyFacts(host.db, host.published);
    expect(retry).toEqual(host.transfer);
    host.sqlite.exec('DROP TRIGGER reject_verified_receipt');
    if (!retry) throw new Error('ready_retry_missing');
    expect((await applyVerifiedDesktopFramedSyncInbound({ db: host.db, transfers: [retry] })).receipts).toHaveLength(1);
    const current = await loadCurrentVerifiedSyncNode(host.db, host.record.object_id);
    if (current?.body.kind !== 'readable') throw new Error('readable_retry_result_required');
    expect(await readBodyText(host.db, current.body.ref)).toBe(body);
    expect(host.sqlite.prepare('SELECT count(*) FROM framed_sync_blob_pins').pluck().get()).toBe(0);
  } finally { host.sqlite.close(); }
});
