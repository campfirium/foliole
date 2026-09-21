import { expect, it } from 'vitest';

import { assertRegisteredMacosA5Action } from './macos-a5-action-registry.mjs';
import { assessS220MainChanges } from './macos-a5-s220-main-facts.mjs';

const snapshot = { attachments: { sha256: 'same' },
  database: { counts: { nodes: 20 }, inspection: { activeSyncGroupId: 'group' } } };
const original = { nodeRowsHash: 'node-hash', dirty: [{ object_type: 'node', content_hash: 'old' },
  { object_type: 'view_state', content_hash: 'cursor-old' }],
deliveryRows: [{ operation_id: 'old', object_type: 'node', status: 'pending' }] };
const restarted = { ...original, dirty: [original.dirty[0],
  { object_type: 'view_state', content_hash: 'cursor-new' }],
deliveryRows: [...original.deliveryRows, { operation_id: 'new', object_type: 'view_state',
  object_id: 'session_resume:android:phone:A5:active_node', status: 'pending' }] };

it('permits only session-cursor receipt growth while preserving business state', () => {
  const result = assessS220MainChanges(original, restarted, snapshot, snapshot);
  expect(result).toMatchObject({ corePreserved: true, expectedDeliveryChanges: true });
  expect(result.addedDeliveries).toHaveLength(1);
  expect(result.removedDeliveries).toHaveLength(0);
  expect(assertRegisteredMacosA5Action('s220-main-compare')).toMatchObject({
    deviceLeaseMode: 'readonly-lifecycle', mutatesFixedA5: false
  });
});

it('fails closed on business changes, unrelated receipts, or removed deliveries', () => {
  expect(assessS220MainChanges(original, { ...restarted, nodeRowsHash: 'changed' },
    snapshot, snapshot).corePreserved).toBe(false);
  expect(assessS220MainChanges(original, { ...restarted, deliveryRows: [
    ...original.deliveryRows, { operation_id: 'new', object_type: 'node', status: 'pending' }
  ] }, snapshot, snapshot).expectedDeliveryChanges).toBe(false);
  expect(assessS220MainChanges(original, { ...restarted, deliveryRows: [] },
    snapshot, snapshot).expectedDeliveryChanges).toBe(false);
});
