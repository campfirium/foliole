// @vitest-environment node
import { afterEach, beforeEach, expect, it } from 'vitest';

import { confirmOutboundNodeVersionPack } from '../../lib/core/sync/nodeVersionDeliveryProof.js';
import { loadPendingNodeVersionReceipts, markNodeVersionReceiptDelivered } from '../../lib/core/sync/nodeVersionInboundReceipt.js';

import { assertPersisted, buildPack, closeLibraries, createPeer, edit, joinPeers, receivePack, startLibraries, sync } from './syncEmptyLibraryTestSupport.js';

beforeEach(startLibraries);
afterEach(closeLibraries);

it('reclaims completed confirmations across repeated production pack commits', async () => {
  const a = createPeer('a');
  const b = createPeer('b');
  joinPeers(a, b);
  for (let round = 0; round < 8; round++) {
    edit(a, `body-${round}`);
    await sync(a, b);
    const [receipt] = await loadPendingNodeVersionReceipts(b.port, a.id);
    if (!receipt) throw new Error('Expected a persisted confirmation');
    // The sender committed, but its reply was lost. Retry the persisted confirmation.
    await confirmOutboundNodeVersionPack(a.port, { ...receipt, confirmedAt: 'later' });
    await markNodeVersionReceiptDelivered(b.port, receipt.packId);
    assertPersisted(b, `body-${round}`);
    expect(b.db.prepare('SELECT COUNT(*) FROM node_version_inbound_receipts').pluck().get()).toBe(0);
    expect(a.db.prepare('SELECT COUNT(*) FROM node_version_pack_receipts').pluck().get()).toBe(0);
    expect(a.db.prepare('SELECT COUNT(*) FROM node_version_outbound_holds').pluck().get()).toBe(0);
  }
});

it('consumes out-of-order persisted confirmations without rolling the current base back', async () => {
  const a = createPeer('a');
  const b = createPeer('b');
  joinPeers(a, b);
  edit(a, 'first');
  await receivePack(a, b, await buildPack(a, b));
  const latest = edit(a, 'second');
  await receivePack(a, b, await buildPack(a, b));
  const receipts = await loadPendingNodeVersionReceipts(b.port, a.id);
  expect(receipts).toHaveLength(2);
  for (const receipt of [...receipts].reverse()) {
    await confirmOutboundNodeVersionPack(a.port, { ...receipt, confirmedAt: 'now' });
    await markNodeVersionReceiptDelivered(b.port, receipt.packId);
  }
  expect(a.db.prepare('SELECT version_id FROM node_version_device_bases').pluck().get()).toBe(latest);
  expect(a.db.prepare('SELECT COUNT(*) FROM node_version_outbound_holds').pluck().get()).toBe(0);
  expect(a.db.prepare('SELECT COUNT(*) FROM node_version_pack_receipts').pluck().get()).toBe(0);
  for (const receipt of receipts) await confirmOutboundNodeVersionPack(a.port, { ...receipt, confirmedAt: 'repeat' });
  const latestReceipt = receipts[1];
  if (!latestReceipt) throw new Error('Expected the second persisted confirmation');
  await expect(confirmOutboundNodeVersionPack(a.port, { ...latestReceipt, confirmedAt: 'invalid',
    results: latestReceipt.results.map((row) => ({ ...row, baseVersionId: null })) }))
    .rejects.toThrow('node_version_pack_receipt_mismatch');
  assertPersisted(a, 'second', latest);
});

it('rolls back a partially invalid confirmation and preserves its recoverable exact hold', async () => {
  const a = createPeer('a');
  const b = createPeer('b');
  joinPeers(a, b);
  edit(a, 'body');
  await receivePack(a, b, await buildPack(a, b));
  const [receipt] = await loadPendingNodeVersionReceipts(b.port, a.id);
  if (!receipt || !receipt.results[0]) throw new Error('Expected a persisted object confirmation');
  await expect(confirmOutboundNodeVersionPack(a.port, { ...receipt, confirmedAt: 'invalid',
    results: [...receipt.results, { ...receipt.results[0], objectId: 'missing' }] }))
    .rejects.toThrow('node_version_pack_hold_missing');
  expect(a.db.prepare('SELECT COUNT(*) FROM node_version_outbound_holds').pluck().get()).toBe(1);
  expect(a.db.prepare('SELECT COUNT(*) FROM node_version_confirmation_state').pluck().get()).toBe(0);
  expect(a.db.prepare('SELECT COUNT(*) FROM node_version_device_bases').pluck().get()).toBe(0);
  await confirmOutboundNodeVersionPack(a.port, { ...receipt, confirmedAt: 'recovered' });
  await markNodeVersionReceiptDelivered(b.port, receipt.packId);
  expect(a.db.prepare('SELECT COUNT(*) FROM node_version_outbound_holds').pluck().get()).toBe(0);
});
