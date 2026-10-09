// @vitest-environment node
import { afterEach, expect, it } from 'vitest';

import { closeApplyHarnesses, harness, input, nodeRecord, stage } from '../../../../../../electron/database/companionFramedSyncApplyHarness.testSupport.js';
import { ROOT_CHILD_ORDER_ID } from '../../../../../../lib/core/database/parentChildOrder.js';
import { computeSyncContentHash } from '../../../../../../lib/core/database/syncState.js';
import { compareFramedSyncInventories } from '../../../../../../lib/core/sync/framedSyncInventory.js';
import { readFramedSyncInventory } from '../../../../../../lib/core/sync/framedSyncInventoryRead.js';
import { deliverFramedSyncDifferencesInDependencyOrder } from '../../../../../../lib/core/sync/framedSyncInventoryRoundDelivery.js';
import { projectFramedSyncNodeRecord } from '../../../../../../lib/core/sync/framedSyncNodeProjection.js';
import { applyFramedSyncObjectStateRecord, restoreFramedSyncObjectStateFact, selectFramedSyncObjectStateFact } from '../../../../../../lib/core/sync/framedSyncObjectStateFact.js';
import { parentOrderFactPayload } from '../../../../../../lib/core/sync/syncParentOrderFact.js';
import { parentOrderBaselineVersionId, PARENT_ORDER_BASELINE_TIME } from '../../../../../../lib/core/sync/syncParentOrderVersionStore.js';

import { applyCompanionFramedSyncTransfer } from './companionFramedSyncApply.js';

afterEach(closeApplyHarnesses);

async function prepared(kind: 'android' | 'ios') {
  const source = await harness(kind);
  const receiver = await harness(kind);
  const record = nodeRecord();
  const projection = projectFramedSyncNodeRecord(record);
  const nodeTransfer = new Uint8Array(32).fill(1);
  const nodeStage = { blob: { data: projection.bodyBlob, descriptor: projection.manifest.blobs[0]! },
    facts: projection.manifest.facts, transferId: nodeTransfer };
  stage(source.staging, source.prefix, nodeStage);
  stage(receiver.staging, receiver.prefix, nodeStage);
  await applyCompanionFramedSyncTransfer(source.port, input(kind, source.stagingPath, nodeTransfer));
  const ids = [record.object_id];
  const version = { versionId: parentOrderBaselineVersionId(ROOT_CHILD_ORDER_ID, ids),
    kind: 'baseline' as const, order: ids, parentVersionIds: [] };
  const payloads = [
    { type: 'order_version', id: version.versionId,
      payload: parentOrderFactPayload(ROOT_CHILD_ORDER_ID, version, PARENT_ORDER_BASELINE_TIME) },
    { type: 'parent_child_order', id: ROOT_CHILD_ORDER_ID,
      payload: { child_ids_json: JSON.stringify(ids), parent_id: ROOT_CHILD_ORDER_ID } }
  ];
  const facts = [];
  for (const { type, id, payload } of payloads) {
    const hash = computeSyncContentHash(type, payload);
    await source.port.transaction(tx => applyFramedSyncObjectStateRecord(tx, {
      object_type: type, object_id: id, payload_json: JSON.stringify(payload), content_hash: hash,
      current_version_id: type === 'parent_child_order' ? version.versionId : null,
      updated_at: PARENT_ORDER_BASELINE_TIME, deleted_at: null
    }));
    facts.push(await selectFramedSyncObjectStateFact(source.port, { objectType: type, globalId: id },
      `${type}:${hash}${type === 'parent_child_order' ? `:${version.versionId}` : ''}`));
  }
  const orderTransfer = new Uint8Array(32).fill(2);
  const versionTransfer = new Uint8Array(32).fill(3);
  stage(receiver.staging, receiver.prefix, { facts: [facts[0]!], transferId: versionTransfer });
  await applyCompanionFramedSyncTransfer(receiver.port, input(kind, receiver.stagingPath, versionTransfer));
  stage(receiver.staging, receiver.prefix, { facts: [facts[1]!], transferId: orderTransfer });
  const differences = compareFramedSyncInventories({ local: [], remote: await readFramedSyncInventory(source.port) });
  const order = differences.find(item => item.objectType === 'parent_child_order');
  const node = differences.find(item => item.objectType === 'node');
  if (!order || !node) throw new Error('fixture_inventory_missing');
  return { receiver, order, node, nodeTransfer, orderTransfer, ids, facts };
}

it.each(['android', 'ios'] as const)('recovers %s order arriving before its ordinary member', async kind => {
  const { receiver, order, node, nodeTransfer, orderTransfer, ids, facts } = await prepared(kind);
  const calls: string[] = [];
  const deliver = async (item: typeof order) => {
    calls.push(item.objectType);
    await applyCompanionFramedSyncTransfer(receiver.port,
      input(kind, receiver.stagingPath, item.objectType === 'node' ? nodeTransfer : orderTransfer));
    return 'delivered' as const;
  };
  expect(await deliverFramedSyncDifferencesInDependencyOrder([order], deliver)).toEqual([order]);
  expect(receiver.main.prepare('SELECT COUNT(*) FROM framed_sync_receipts').pluck().get()).toBe(1);
  expect(receiver.main.prepare('SELECT COUNT(*) FROM parent_child_order').pluck().get()).toBe(0);
  expect(await deliverFramedSyncDifferencesInDependencyOrder([order, node], deliver)).toEqual([]);
  expect(calls).toEqual(['parent_child_order', 'parent_child_order', 'node', 'parent_child_order']);
  expect(receiver.main.prepare('SELECT child_ids_json FROM parent_child_order WHERE parent_id = ?')
    .pluck().get(ROOT_CHILD_ORDER_ID)).toBe(JSON.stringify(ids));
  expect(receiver.main.prepare('SELECT COUNT(*) FROM framed_sync_receipts').pluck().get()).toBe(3);
  const fact = facts[1]!;
  const saved = await selectFramedSyncObjectStateFact(receiver.port,
    { objectType: 'parent_child_order', globalId: ROOT_CHILD_ORDER_ID }, fact.factId);
  const original = restoreFramedSyncObjectStateFact(fact);
  expect(restoreFramedSyncObjectStateFact(saved)).toMatchObject({
    object_id: original.object_id, content_hash: original.content_hash,
    current_version_id: original.current_version_id, payload_json: original.payload_json
  });
});
