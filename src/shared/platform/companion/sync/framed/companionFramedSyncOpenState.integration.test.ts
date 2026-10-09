// @vitest-environment node
import { afterEach, expect, it } from 'vitest';

import { closeApplyHarnesses, harness, input, nodeRecord, stage } from '../../../../../../electron/database/companionFramedSyncApplyHarness.testSupport.js';
import { computeSyncContentHash } from '../../../../../../lib/core/database/syncState.js';
import { compareFramedSyncInventories } from '../../../../../../lib/core/sync/framedSyncInventory.js';
import { readFramedSyncInventory } from '../../../../../../lib/core/sync/framedSyncInventoryRead.js';
import { deliverFramedSyncDifferencesInDependencyOrder } from '../../../../../../lib/core/sync/framedSyncInventoryRoundDelivery.js';
import { projectFramedSyncNodeRecord } from '../../../../../../lib/core/sync/framedSyncNodeProjection.js';
import { selectFramedSyncObjectStateFact } from '../../../../../../lib/core/sync/framedSyncObjectStateFact.js';
import { applySyncObjectInTransaction } from '../../../../../../lib/core/sync/syncObjectApplyExecutor.js';

import { applyCompanionFramedSyncTransfer } from './companionFramedSyncApply.js';

afterEach(closeApplyHarnesses);

async function prepared(kind: 'android' | 'ios') {
  const source = await harness(kind);
  const receiver = await harness(kind);
  source.main.pragma('foreign_keys = ON');
  receiver.main.pragma('foreign_keys = ON');
  const record = nodeRecord();
  record.snapshot.kind = 'folder';
  record.body_text = '';
  const projection = projectFramedSyncNodeRecord(record);
  const nodeTransfer = new Uint8Array(32).fill(1);
  const nodeStage = { blob: { data: projection.bodyBlob, descriptor: projection.manifest.blobs[0]! },
    facts: projection.manifest.facts, transferId: nodeTransfer };
  stage(source.staging, source.prefix, nodeStage);
  await applyCompanionFramedSyncTransfer(source.port, input(kind, source.stagingPath, nodeTransfer));
  const payload = { node_id: record.object_id, last_opened_at: '2026-10-09T09:00:00.000Z' };
  const hash = computeSyncContentHash('node_open_state', payload);
  await applySyncObjectInTransaction(source.port, { object_type: 'node_open_state', object_id: record.object_id,
    content_hash: hash, payload_json: JSON.stringify(payload), deleted_at: null, updated_at: payload.last_opened_at });
  const fact = await selectFramedSyncObjectStateFact(source.port,
    { objectType: 'node_open_state', globalId: record.object_id }, `node_open_state:${hash}`);
  const stateTransfer = new Uint8Array(32).fill(2);
  stage(receiver.staging, receiver.prefix, { facts: [fact], transferId: stateTransfer });
  stage(receiver.staging, receiver.prefix, nodeStage);
  const differences = compareFramedSyncInventories({ local: [], remote: await readFramedSyncInventory(source.port) });
  const state = differences.find(item => item.objectType === 'node_open_state');
  const node = differences.find(item => item.objectType === 'node');
  if (!state || !node) throw new Error('fixture_inventory_missing');
  return { receiver, state, node, nodeTransfer, stateTransfer, payload, fact, record };
}

it.each(['android', 'ios'] as const)('recovers %s open-state arriving before its folder', async kind => {
  const { receiver, state, node, nodeTransfer, stateTransfer, payload, fact, record } = await prepared(kind);
  const calls: string[] = [];
  const deliver = async (item: typeof state) => {
    calls.push(item.objectType);
    await applyCompanionFramedSyncTransfer(receiver.port,
      input(kind, receiver.stagingPath, item.objectType === 'node' ? nodeTransfer : stateTransfer));
    return 'delivered' as const;
  };
  expect(await deliverFramedSyncDifferencesInDependencyOrder([state], deliver)).toEqual([state]);
  expect(receiver.main.prepare('SELECT COUNT(*) FROM framed_sync_receipts').pluck().get()).toBe(0);
  expect(await deliverFramedSyncDifferencesInDependencyOrder([state, node], deliver)).toEqual([]);
  expect(calls).toEqual(['node_open_state', 'node_open_state', 'node', 'node_open_state']);
  expect(receiver.main.prepare('SELECT kind, content FROM nodes WHERE id = ?').get(record.object_id))
    .toEqual({ kind: 'folder', content: '' });
  expect(receiver.main.prepare('SELECT last_opened_at FROM node_open_state WHERE node_id = ?').pluck().get(record.object_id))
    .toBe(payload.last_opened_at);
  expect(receiver.main.prepare('SELECT COUNT(*) FROM framed_sync_receipts').pluck().get()).toBe(2);
  expect(await selectFramedSyncObjectStateFact(receiver.port,
    { objectType: 'node_open_state', globalId: record.object_id }, fact.factId)).toEqual(fact);
});
