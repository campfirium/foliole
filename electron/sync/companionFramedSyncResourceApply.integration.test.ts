// @vitest-environment node
import { isDeepStrictEqual } from 'node:util';

import { expect, it } from 'vitest';

import { FRAMED_SYNC_RESOURCE_DEMAND_SCHEMA } from '../../lib/core/database/framedSyncResourceDemandSchema.js';
import { applyCompanionFramedSyncTransfer } from '../../src/shared/platform/companion/sync/framed/companionFramedSyncApply.js';
import { applyVerifiedCompanionFramedSyncTransfer } from '../../src/shared/platform/companion/sync/framed/companionFramedSyncVerifiedApply.js';

import { companionResourceFixture, resourceBusinessState } from './companionFramedSyncResourceApply.testSupport.js';
import { verifiedCompanionFixture } from './companionFramedSyncVerifiedApply.testSupport.js';

const kinds = ['android', 'ios'] as const;

it.each(kinds)('applies %s attachment availability and independent receipt without changing library bodies or versions', async (kind) => {
  const { host, input, contentId, hash } = await companionResourceFixture(kind);
  try {
    const before = resourceBusinessState(host);
    const receipt = await applyVerifiedCompanionFramedSyncTransfer(host.port(), input);
    expect(receipt.contentId).toEqual(contentId);
    expect(receipt.appliedStateHash).toEqual(contentId);
    expect(host.main.prepare('SELECT available FROM framed_sync_resource_availability WHERE hash = ?').pluck().get(hash)).toBe(1);
    expect(host.main.prepare('SELECT state FROM framed_sync_resource_demands').pluck().get()).toBe('verified_present');
    expect(isDeepStrictEqual(resourceBusinessState(host), before)).toBe(true);
    host.reopen();
    expect(await applyVerifiedCompanionFramedSyncTransfer(host.port(), input)).toEqual(receipt);
    expect(host.main.prepare('SELECT count(*) FROM framed_sync_receipts').pluck().get()).toBe(1);
  } finally { host.close(); }
});

it.each(kinds)('routes %s ordinary single-transfer kind7 through the attached verified receipt transaction', async (kind) => {
  const { host, input } = await companionResourceFixture(kind);
  try {
    const before = resourceBusinessState(host);
    await applyCompanionFramedSyncTransfer(host.port(), input);
    expect(isDeepStrictEqual(resourceBusinessState(host), before)).toBe(true);
    expect(host.main.prepare('SELECT state FROM framed_sync_resource_demands').pluck().get()).toBe('verified_present');
  } finally { host.close(); }
});

it.each(kinds)('rolls back %s availability, receipt and demand together and retries after reopening', async (kind) => {
  const { host, input } = await companionResourceFixture(kind);
  try {
    host.main.exec(`CREATE TRIGGER fail_resource_receipt BEFORE INSERT ON framed_sync_receipts
      BEGIN SELECT RAISE(ABORT, 'resource_receipt_failure'); END`);
    await expect(applyVerifiedCompanionFramedSyncTransfer(host.port(), input)).rejects.toThrow('resource_receipt_failure');
    expect(host.main.prepare('SELECT count(*) FROM framed_sync_resource_availability').pluck().get()).toBe(0);
    expect(host.main.prepare('SELECT count(*) FROM framed_sync_receipts').pluck().get()).toBe(0);
    expect(host.main.prepare('SELECT state FROM framed_sync_resource_demands').pluck().get()).toBe('pending');
    expect(host.native.prepare(`SELECT count(*) FROM ${host.prefix}_resource_pins`).pluck().get()).toBe(1);
    host.main.exec('DROP TRIGGER fail_resource_receipt');
    host.reopen();
    await applyVerifiedCompanionFramedSyncTransfer(host.port(), input);
    expect(host.main.prepare('SELECT state FROM framed_sync_resource_demands').pluck().get()).toBe('verified_present');
  } finally { host.close(); }
});

it.each(kinds)('rejects %s missing promoted resources and mismatching demand without publishing availability', async (kind) => {
  const { host, input } = await companionResourceFixture(kind);
  try {
    host.native.prepare(`UPDATE ${host.prefix}_available_resources SET byte_length = 18`).run();
    await expect(applyVerifiedCompanionFramedSyncTransfer(host.port(), input)).rejects.toThrow('framed_sync_resource_pin_set_mismatch');
    host.native.prepare(`UPDATE ${host.prefix}_available_resources SET byte_length = 17`).run();
    host.main.prepare(`UPDATE framed_sync_resource_demands SET demand_id = 'different'`).run();
    await expect(applyVerifiedCompanionFramedSyncTransfer(host.port(), input)).rejects.toThrow('framed_sync_resource_demand_mismatch');
    expect(host.main.prepare('SELECT count(*) FROM framed_sync_resource_availability').pluck().get()).toBe(0);
    expect(host.main.prepare('SELECT count(*) FROM framed_sync_receipts').pluck().get()).toBe(0);
  } finally { host.close(); }
});

it.each(kinds)('rejects %s context and extra body pins before attachment receipt', async (kind) => {
  const { host, input } = await companionResourceFixture(kind);
  try {
    await expect(applyVerifiedCompanionFramedSyncTransfer(host.port(), { ...input, receiverLibraryEpoch: 'other' }))
      .rejects.toThrow('framed_sync_transfer_context_mismatch');
    host.native.prepare(`INSERT INTO ${host.prefix}_blob_pins VALUES (?, ?, 0, 1, 1)`)
      .run(input.transferId, host.descriptor.sha256);
    await expect(applyVerifiedCompanionFramedSyncTransfer(host.port(), input))
      .rejects.toThrow('framed_sync_resource_pin_set_mismatch');
    expect(host.main.prepare('SELECT count(*) FROM framed_sync_receipts').pluck().get()).toBe(0);
    expect(host.main.prepare('SELECT state FROM framed_sync_resource_demands').pluck().get()).toBe('pending');
  } finally { host.close(); }
});

it.each(kinds)('does not complete %s attachment demand when a database unit carries no attachment descriptors', async (kind) => {
  const host = await verifiedCompanionFixture(kind, 'Database body');
  try {
    host.main.exec(FRAMED_SYNC_RESOURCE_DEMAND_SCHEMA);
    host.main.prepare(`INSERT INTO framed_sync_resource_demands
      (group_id, receiver_device_id, receiver_library_epoch, global_id, version_id,
        body_hash, storage_key, demand_id, state)
      VALUES ('group', 'receiver', 'receiver-epoch', 'node-1', 'version-1', ?, ?, 'pending-file', 'pending')`)
      .run('b'.repeat(64), `${'a'.repeat(64)}.png`);
    await applyVerifiedCompanionFramedSyncTransfer(host.port(), host.input);
    expect(host.main.prepare('SELECT state FROM framed_sync_resource_demands').pluck().get()).toBe('pending');
    expect(host.main.prepare('SELECT count(*) FROM framed_sync_resource_availability').pluck().get()).toBe(0);
  } finally { host.close(); }
});
