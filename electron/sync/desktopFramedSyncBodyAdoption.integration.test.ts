// @vitest-environment node
import { expect, it } from 'vitest';

import { loadCurrentSyncNodeRecord } from '../../lib/core/sync/syncNodeGraph.js';

import { loadDesktopFramedSyncReadySource } from './desktopFramedSyncReadySource.js';
import { applyVerifiedDesktopFramedSyncInbound } from './desktopFramedSyncVerifiedApply.js';
import { verifiedApplyBusinessRows, verifiedDesktopReadyFixture } from './desktopFramedSyncVerifiedApply.testSupport.js';

it.each(['', '\ufeff中😀\0tail'])('keeps complete business text after ready owner cleanup', async (text) => {
  const host = await verifiedDesktopReadyFixture(text);
  try {
    await applyVerifiedDesktopFramedSyncInbound({ db: host.db, transfers: [host.transfer] });
    expect((await loadCurrentSyncNodeRecord(host.db, host.record.object_id))?.body_text).toBe(text);
    expect(host.sqlite.prepare('SELECT count(*) FROM framed_sync_available_blobs').pluck().get()).toBe(0);
  } finally { host.sqlite.close(); }
});

it.each(['state', 'context', 'protocol', 'manifest', 'pin', 'available_header', 'raw_length', 'raw_type'])(
  'rejects %s corruption before business writes', async (kind) => {
    const host = await verifiedDesktopReadyFixture('Original');
    try {
      const before = verifiedApplyBusinessRows(host);
      const published = { ...host.published };
      if (kind === 'state') host.sqlite.exec("UPDATE framed_sync_inbound_transfers SET state = 'receiving'");
      if (kind === 'context') published.context = { ...published.context, groupId: 'other' };
      if (kind === 'protocol') host.sqlite.exec('UPDATE framed_sync_inbound_transfers SET protocol_version = 21');
      if (kind === 'manifest') published.manifestHash = new Uint8Array(32).fill(9);
      if (kind === 'pin') host.sqlite.exec('UPDATE framed_sync_blob_pins SET required = 0');
      if (kind === 'available_header') host.sqlite.exec('UPDATE framed_sync_available_blobs SET byte_length = 9');
      if (kind === 'raw_length') host.sqlite.exec("UPDATE framed_sync_available_blobs SET data = X'00'");
      if (kind === 'raw_type') host.sqlite.exec("UPDATE framed_sync_available_blobs SET data = 'Original'");
      const apply = async () => {
        const ready = await loadDesktopFramedSyncReadySource(host.db, published);
        if (!ready) throw new Error('framed_sync_transfer_not_ready');
        return applyVerifiedDesktopFramedSyncInbound({ db: host.db, transfers: [ready] });
      };
      await expect(apply()).rejects.toThrow();
      expect(verifiedApplyBusinessRows(host)).toEqual(before);
      expect(await host.staging.loadReceipt(published.transferId)).toBeNull();
    } finally { host.sqlite.close(); }
  });

it('rejects complete bytes with the wrong SHA while retaining the ready owner for retry', async () => {
  const host = await verifiedDesktopReadyFixture('Original');
  try {
    const before = verifiedApplyBusinessRows(host);
    host.sqlite.prepare('UPDATE framed_sync_available_blobs SET data = ?').run(Buffer.from('Corrupt!'));
    await expect(applyVerifiedDesktopFramedSyncInbound({ db: host.db, transfers: [host.transfer] }))
      .rejects.toThrow('framed_sync_published_body_unavailable');
    expect(verifiedApplyBusinessRows(host)).toEqual(before);
    expect(host.sqlite.prepare('SELECT state FROM framed_sync_inbound_transfers').pluck().get()).toBe('ready_to_apply');
    host.sqlite.prepare('UPDATE framed_sync_available_blobs SET data = ?').run(Buffer.from('Original'));
    await applyVerifiedDesktopFramedSyncInbound({ db: host.db, transfers: [host.transfer] });
    expect((await loadCurrentSyncNodeRecord(host.db, host.record.object_id))?.body_text).toBe('Original');
  } finally { host.sqlite.close(); }
});
