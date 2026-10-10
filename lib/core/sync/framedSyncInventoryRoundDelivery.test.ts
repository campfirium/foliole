import { expect, it } from 'vitest';

import type { FramedSyncInventoryDifference } from './framedSyncInventory.js';
import { deliverFramedSyncDifferencesInDependencyOrder, readFramedSyncMissingDependency } from './framedSyncInventoryRoundDelivery.js';

function difference(globalId: string, objectType = 'node'): FramedSyncInventoryDifference {
  return { direction: 'local_to_remote', globalId, objectType,
    need: { frontierFactIds: [], requiredRelationIds: [], resourceHashes: [], reviewFactIds: [], sharedState: true },
    sourceSnapshot: { frontierFactIds: [], globalId, objectType, requiredRelationIds: [], resourceHashes: [],
      reviewFactIds: [], sharedStateHash: new Uint8Array(32) } };
}

it.each(['receipt_identity_conflict:', 'aead_authentication_failure:', 'framed_sync_http_401:'])(
  'does not reinterpret %s containing a dependency code', prefix => {
    expect(readFramedSyncMissingDependency(new Error(`${prefix}framed_sync_node_parent_missing:parent`))).toBeNull();
    expect(readFramedSyncMissingDependency(new Error(
      `Failed to pull framed Sync objects. Cause: IllegalStateException: ${prefix}framed_sync_node_parent_missing:parent`
    ))).toBeNull();
  });

it('accepts the original dependency wrappers and rejects trailing data', () => {
  for (const prefix of ['', 'framed_sync_http_400:', 'Failed to pull framed Sync object. Cause: ',
    'Failed to pull framed Sync object: ', 'Failed to pull framed Sync objects: ']) {
    expect(readFramedSyncMissingDependency(new Error(`${prefix}framed_sync_node_parent_missing:parent`)))
      .toMatchObject({ globalId: 'parent', objectType: 'node' });
  }
  expect(readFramedSyncMissingDependency(new Error(
    'round: Error: framed_sync_http_400:framed_sync_node_parent_missing:parent\n    at originalReceiver'
  ))).toMatchObject({ globalId: 'parent', objectType: 'node' });
  for (const id of ['', 'parent\n', 'parent other', 'x'.repeat(129)]) {
    expect(readFramedSyncMissingDependency(new Error(`framed_sync_node_parent_missing:${id}`))).toBeNull();
  }
});

it.each(['Failed to send framed Sync transfer. Cause: IllegalStateException: ',
  'Failed to send framed Sync transfers. Cause: IllegalStateException: ',
  'Failed to send framed Sync transfer: ', 'Failed to pull framed Sync object. Cause: '])(
  'recognizes a missing dependency through native wrapper %s and HTTP 400', wrapper => {
    expect(readFramedSyncMissingDependency(new Error(`${wrapper}framed_sync_http_400:node_position_lineage_unproven:topic`)))
      .toMatchObject({ globalId: 'topic', objectType: 'node' });
    expect(readFramedSyncMissingDependency(new Error(`${wrapper}framed_sync_http_401:node_position_lineage_unproven:topic`)))
      .toBeNull();
  });

it.each(['framed_sync_node_parent_missing:', 'node_position_lineage_unproven:',
  'parent_order_position_lineage_unproven:', 'sync_parent_order_body_unavailable:',
  'framed_sync_review_node_missing:', 'sync_node_open_state_node_missing:',
  'sync_parent_order_member_missing:',
  'framed_sync_parent_relation_version_missing:'])('defers unavailable %s dependency while later independent units still deliver', async prefix => {
  const child = difference('child');
  const independent = difference('independent');
  const calls: string[] = [];
  const deferred = await deliverFramedSyncDifferencesInDependencyOrder([child, independent], async item => {
    calls.push(item.globalId);
    if (item === child) throw new Error(`framed_sync_http_400:${prefix}missing`);
    return 'delivered';
  });
  expect(deferred).toEqual([child]);
  expect(calls).toEqual(['child', 'independent']);
});

it('defers a review-only unit missing its own node instead of retrying itself as a dependency', async () => {
  const review = difference('reviewed-node');
  const independent = difference('independent');
  const calls: string[] = [];
  expect(await deliverFramedSyncDifferencesInDependencyOrder([review, independent], async item => {
    calls.push(item.globalId);
    if (item === review) throw new Error('framed_sync_review_node_missing:reviewed-node');
    return 'delivered';
  })).toEqual([review]);
  expect(calls).toEqual(['reviewed-node', 'independent']);
});

it.each(['', 'Failed to pull framed Sync object. Cause: IllegalStateException: ',
  'Failed to pull framed Sync objects. Cause: IllegalStateException: '])(
  'delivers an available parent before its child through %s', async prefix => {
  const child = difference('child');
  const parent = difference('parent');
  const independent = difference('independent');
  const calls: string[] = [];
  let parentDelivered = false;
  const deferred = await deliverFramedSyncDifferencesInDependencyOrder([child, parent, independent], async item => {
    calls.push(item.globalId);
    if (item === child && !parentDelivered) throw new Error(`${prefix}framed_sync_node_parent_missing:parent`);
    if (item === parent) parentDelivered = true;
    return 'delivered';
  });
  expect(deferred).toEqual([]);
  expect(calls).toEqual(['child', 'parent', 'child', 'independent']);
});

it('defers a child still missing lineage after its parent delivered without looping or blocking later units', async () => {
  const child = difference('child');
  const parent = difference('parent');
  const independent = difference('independent');
  const calls: string[] = [];
  const deferred = await deliverFramedSyncDifferencesInDependencyOrder([parent, child, independent], async item => {
    calls.push(item.globalId);
    if (item === child) throw new Error('node_position_lineage_unproven:parent');
    return 'delivered';
  });
  expect(deferred).toEqual([child]);
  expect(calls).toEqual(['parent', 'child', 'independent']);
});

it('keeps dependency cycles and unrelated protocol errors fatal', async () => {
  const child = difference('child');
  const parent = difference('parent');
  await expect(deliverFramedSyncDifferencesInDependencyOrder([child, parent], async item => {
    throw new Error(`framed_sync_node_parent_missing:${item === child ? 'parent' : 'child'}`);
  })).rejects.toThrow('framed_sync_node_parent_cycle');
  await expect(deliverFramedSyncDifferencesInDependencyOrder([child, parent], async () => {
    throw new Error('protocol_decode_invalid');
  })).rejects.toThrow('protocol_decode_invalid');
});
