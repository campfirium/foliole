// @vitest-environment node
import { promises as fs } from 'node:fs';
import { performance } from 'node:perf_hooks';

import Database from 'better-sqlite3';
import { expect, it } from 'vitest';
import { z } from 'zod';

import { compareFramedSyncInventories } from '../../lib/core/sync/framedSyncInventory.js';
import { readFramedSyncInventory } from '../../lib/core/sync/framedSyncInventoryRead.js';
import { finishSyncGroupLocalAdoption, loadSyncGroupLocalAdoption } from '../../lib/core/sync/syncGroupLocalAdoption.js';
import { finishSyncGroupOverwriteProgress, prepareSyncGroupOverwrite } from '../../lib/core/sync/syncGroupOverwriteProgress.js';
import { applyPreparedCompanionFramedSyncTransfers }
  from '../../src/shared/platform/companion/sync/framed/companionFramedSyncApplyPrepared.js';

import { openCompanionAdoptionFixture } from './companionFramedSyncGroupAdoption.testSupport.js';
import { createDesktopFramedSyncTwoProcessFixture } from './desktopFramedSyncTwoProcess.testSupport.js';

const itemCount = z.coerce.number().int().min(2).max(15_000).parse(
  process.env.FOLIOLE_FRAMED_SYNC_ADOPTION_ITEMS ?? 24
);

it('completes all discovered HTTP deliveries with per-unit companion adoption after staging interruption', async () => {
  const fixture = await createDesktopFramedSyncTwoProcessFixture();
  let receiver: Awaited<ReturnType<typeof openCompanionAdoptionFixture>> | undefined;
  let passed = false;
  const started = performance.now();
  try {
    await fixture.left.seedBatch(itemCount);
    receiver = await openCompanionAdoptionFixture(fixture.root, fixture.leftSnapshot);
    const inventory = await receiver.inventory();
    expect(inventory.local).toEqual([]);
    expect(inventory.differences.length).toBeGreaterThanOrEqual(itemCount);
    const half = Math.floor(inventory.differences.length / 2);
    for (const difference of inventory.differences.slice(0, half)) await receiver.stage(inventory, difference);
    expect(await loadSyncGroupLocalAdoption(receiver.db)).toEqual(receiver.adoption);
    expect(receiver.main.prepare("SELECT content FROM nodes WHERE id = 'old-local'").pluck().get())
      .toBe('Protected until complete adoption');
    expect(receiver.main.prepare('SELECT COUNT(*) FROM framed_sync_receipts').pluck().get()).toBe(0);
    receiver.reopen();
    expect(await loadSyncGroupLocalAdoption(receiver.db)).toEqual(receiver.adoption);
    expect(await readFramedSyncInventory(receiver.db)).toEqual([]);
    for (const difference of inventory.differences) await receiver.stage(inventory, difference);
    const stagedAt = performance.now();
    const confirmed = await receiver.inventory();
    expect(compareFramedSyncInventories({ local: inventory.remote, remote: confirmed.remote })).toEqual([]);
    const prepared = await receiver.prepare();
    expect(prepared).toHaveLength(inventory.differences.length);
    const preparedAt = performance.now();
    const receipts = await applyOverwriteUnits(receiver, prepared);
    expect(receipts).toHaveLength(prepared.length);
    expect(await loadSyncGroupLocalAdoption(receiver.db)).toBeNull();
    expect(receiver.main.prepare("SELECT id FROM nodes WHERE id = 'old-local'").get()).toBeUndefined();
    expect(receiver.main.prepare("SELECT COUNT(*) FROM nodes WHERE id LIKE 't326-benchmark-%'").pluck().get())
      .toBe(itemCount);
    expect(compareFramedSyncInventories({ local: await readFramedSyncInventory(receiver.db),
      remote: inventory.remote }).filter((difference) => difference.direction === 'remote_to_local')).toEqual([]);
    const appliedAt = performance.now();
    receiver.reopen();
    expect(await loadSyncGroupLocalAdoption(receiver.db)).toBeNull();
    expect(receiver.main.prepare('SELECT COUNT(*) FROM framed_sync_receipts').pluck().get()).toBe(prepared.length);
    await applyPreparedCompanionFramedSyncTransfers(receiver.db, prepared);
    expect(receiver.main.prepare('SELECT COUNT(*) FROM framed_sync_receipts').pluck().get()).toBe(prepared.length);
    await acknowledgeAllDeliveries(receiver, receipts);
    const source = new Database(fixture.leftSnapshot.databasePath, { readonly: true });
    try { expect(source.prepare('SELECT COUNT(*) FROM framed_sync_outbound_holds').pluck().get()).toBe(0); }
    finally { source.close(); }
    console.info(JSON.stringify({ itemCount, transfers: prepared.length,
      stagingAndInterruptionMs: stagedAt - started, prepareMs: preparedAt - stagedAt,
      perUnitApplyMs: appliedAt - preparedAt, restartAndDuplicateMs: performance.now() - appliedAt }));
    passed = true;
  } finally {
    receiver?.close();
    await Promise.allSettled([fixture.left.close(), fixture.right.close()]);
    if (passed) await fs.rm(fixture.root, { recursive: true, force: true });
    else console.info(`Preserved failed adoption fixture: ${fixture.root}`);
  }
}, 3_600_000);

async function acknowledgeAllDeliveries(
  receiver: Awaited<ReturnType<typeof openCompanionAdoptionFixture>>,
  receipts: Awaited<ReturnType<typeof applyPreparedCompanionFramedSyncTransfers>>
) {
  for (const receipt of receipts) {
    const acknowledged = await receiver.acknowledge(receipt);
    expect([...acknowledged.transferId]).toEqual([...receipt.transferId]);
    expect([...acknowledged.contentId]).toEqual([...receipt.contentId]);
    expect([...acknowledged.appliedStateHash]).toEqual([...receipt.appliedStateHash]);
    expect(acknowledged.receiverDeviceId).toBe(receipt.receiverDeviceId);
    expect(acknowledged.receiverLibraryEpoch).toBe(receipt.receiverLibraryEpoch);
  }
}

async function applyOverwriteUnits(receiver: Awaited<ReturnType<typeof openCompanionAdoptionFixture>>,
  prepared: Awaited<ReturnType<Awaited<ReturnType<typeof openCompanionAdoptionFixture>>['prepare']>>) {
  const first = prepared[0]!.input;
  const progress = { groupId: receiver.adoption.groupId, overwriteId: receiver.adoption.libraryEpoch,
    providerDeviceId: first.senderDeviceId, providerLibraryEpoch: first.senderLibraryEpoch,
    receiverDeviceId: first.receiverDeviceId, receiverLibraryEpoch: first.receiverLibraryEpoch };
  await prepareSyncGroupOverwrite(receiver.db, progress);
  const receipts = [];
  for (const unit of prepared) receipts.push(...await applyPreparedCompanionFramedSyncTransfers(receiver.db, [unit]));
  await receiver.db.transaction(async (tx) => {
    await finishSyncGroupOverwriteProgress(tx, progress);
    await finishSyncGroupLocalAdoption(tx, receiver.adoption);
  });
  return receipts;
}
