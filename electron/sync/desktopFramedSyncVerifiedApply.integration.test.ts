// @vitest-environment node
import { expect, it } from 'vitest';

import { readFramedSyncInventoryEntry } from '../../lib/core/sync/framedSyncInventoryRead.js';
import { projectFramedSyncNodeRecord } from '../../lib/core/sync/framedSyncNodeProjection.js';
import { encodeValidatedProtocolMessage } from '../../lib/core/sync/framedSyncProtocolCodec.js';
import { factToWire } from '../../lib/core/sync/framedSyncWireProjection.js';
import { loadCurrentSyncNodeRecord } from '../../lib/core/sync/syncNodeGraph.js';

import { loadDesktopFramedSyncReadySource } from './desktopFramedSyncReadySource.js';
import { applyVerifiedDesktopFramedSyncInbound } from './desktopFramedSyncVerifiedApply.js';
import { verifiedApplyBusinessRows, verifiedApplyReadyRows, verifiedDesktopReadyFixture } from './desktopFramedSyncVerifiedApply.testSupport.js';

it('rejects a changed ready fact during business apply and retries the original frozen source', async () => {
  const host = await verifiedDesktopReadyFixture('Original');
  try {
    const fact = projectFramedSyncNodeRecord(host.record).manifest.facts[0]!;
    const before = verifiedApplyBusinessRows(host);
    const changed = { ...fact, body: [{ name: 'changed', value: { kind: 'string' as const, value: 'Altered' } }] };
    const update = host.sqlite.prepare('UPDATE framed_sync_inbound_frames SET authenticated_plaintext = ? WHERE frame_type = 3');
    update.run(encodeValidatedProtocolMessage('fact', factToWire(changed)));
    const ready = verifiedApplyReadyRows(host);
    await expect(applyVerifiedDesktopFramedSyncInbound({ db: host.db, transfers: [host.transfer] }))
      .rejects.toThrow('canonical_fact_source_changed');
    expect(verifiedApplyBusinessRows(host)).toEqual(before);
    expect(verifiedApplyReadyRows(host)).toEqual(ready);
    update.run(encodeValidatedProtocolMessage('fact', factToWire(fact)));
    expect((await applyVerifiedDesktopFramedSyncInbound({ db: host.db, transfers: [host.transfer] })).receipts).toHaveLength(1);
    const current = await loadCurrentSyncNodeRecord(host.db, host.record.object_id);
    if (!current) throw new Error('current_node_missing');
    expect(current.body_text).toBe('Original');
  } finally { host.sqlite.close(); }
});

it('commits the database body without claiming an attachment is present from its reference alone', async () => {
  const hash = '3'.repeat(64);
  const key = `${hash}.png`;
  const body = `Article\n\n![Cover](Assets/${key})`;
  const host = await verifiedDesktopReadyFixture(body, JSON.stringify([
    { original_name: 'Cover.png', role: 'image', storage_key: key }
  ]));
  try {
    const result = await applyVerifiedDesktopFramedSyncInbound({ db: host.db, transfers: [host.transfer] });
    expect(result.receipts).toHaveLength(1);
    const current = await loadCurrentSyncNodeRecord(host.db, host.record.object_id);
    if (!current) throw new Error('current_node_missing');
    expect(current.body_text).toBe(body);
    expect(current.snapshot.resource_references).toContain(key);
    const inventory = await readFramedSyncInventoryEntry(host.db, { objectType: 'node', globalId: host.record.object_id });
    expect(inventory?.resourceHashes.map((value) => Buffer.from(value).toString('hex'))).not.toContain(hash);
    expect(host.sqlite.prepare('SELECT count(*) FROM framed_sync_available_resources').pluck().get()).toBe(0);
  } finally { host.sqlite.close(); }
});

it.each(['', '\ufeff中😀\0文'.repeat(60000)])('commits a production node fact and receipt before retiring ready body copies', async (body) => {
  const host = await verifiedDesktopReadyFixture(body);
  try {
    const result = await applyVerifiedDesktopFramedSyncInbound({ db: host.db, transfers: [host.transfer] });
    expect(result.generatedChanges).toBe(false);
    expect(result.receipts).toHaveLength(1);
    expect(result.receipts[0]).toEqual(await host.staging.loadReceipt(host.published.transferId));
    expect(result.receipts[0]).toMatchObject({ transferId: host.published.transferId, contentId: host.published.contentId,
      receiverDeviceId: host.published.context.receiverDeviceId, receiverLibraryEpoch: host.published.context.receiverLibraryEpoch });
    expect(await loadDesktopFramedSyncReadySource(host.db, host.published)).toBeNull();
    expect(host.sqlite.prepare('SELECT state, header_json, active_attempt_id FROM framed_sync_inbound_transfers').get())
      .toEqual({ state: 'applied', header_json: null, active_attempt_id: null });
    for (const table of ['framed_sync_blob_pins', 'framed_sync_inbound_attempts', 'framed_sync_inbound_frames',
      'framed_sync_available_blobs']) {
      expect(host.sqlite.prepare(`SELECT count(*) FROM ${table}`).pluck().get()).toBe(0);
    }
    const current = await loadCurrentSyncNodeRecord(host.db, host.record.object_id);
    expect(current?.version_id).toBe(host.record.version_id);
    expect(current?.content_hash).toBe(host.record.content_hash);
    if (!current) throw new Error('current_node_missing');
    expect(current.body_text).toBe(body);
    expect(current.body_text).toBe(body);
    expect(host.sqlite.prepare('SELECT count(*) FROM node_version_local_source_revisions WHERE source_device_identity_key = ?')
      .pluck().get(host.published.context.senderDeviceId)).toBe(1);
  } finally { host.sqlite.close(); }
});

it('rolls back all business effects on receipt failure while retaining durable ready and pins for retry', async () => {
  const body = '\ufeff中😀\0文'.repeat(60000);
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
    const retry = await loadDesktopFramedSyncReadySource(host.db, host.published);
    expect(retry).toEqual(host.transfer);
    host.sqlite.exec('DROP TRIGGER reject_verified_receipt');
    if (!retry) throw new Error('ready_retry_missing');
    expect((await applyVerifiedDesktopFramedSyncInbound({ db: host.db, transfers: [retry] })).receipts).toHaveLength(1);
    const current = await loadCurrentSyncNodeRecord(host.db, host.record.object_id);
    if (!current) throw new Error('current_node_missing');
    expect(current.body_text).toBe(body);
    expect(host.sqlite.prepare('SELECT count(*) FROM framed_sync_blob_pins').pluck().get()).toBe(0);
  } finally { host.sqlite.close(); }
});
