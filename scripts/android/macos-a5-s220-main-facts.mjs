import { createHash } from 'node:crypto';

export function hashS220Fact(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export function assessS220MainChanges(before, after, baseline, current) {
  const businessDirty = (facts) => facts.dirty.filter((item) => item.object_type !== 'view_state');
  const beforeDeliveryKeys = new Set(before.deliveryRows.map((row) => JSON.stringify(row)));
  const afterDeliveryKeys = new Set(after.deliveryRows.map((row) => JSON.stringify(row)));
  const addedDeliveries = after.deliveryRows.filter((row) =>
    !beforeDeliveryKeys.has(JSON.stringify(row)));
  const removedDeliveries = before.deliveryRows.filter((row) =>
    !afterDeliveryKeys.has(JSON.stringify(row)));
  const expectedDeliveryChanges = removedDeliveries.length === 0
    && addedDeliveries.every((row) => row.object_type === 'view_state'
      && row.object_id.includes('session_resume:android:phone:')
      && row.object_id.endsWith(':active_node') && row.status === 'pending');
  const corePreserved = before.nodeRowsHash === after.nodeRowsHash
    && hashS220Fact(businessDirty(before)) === hashS220Fact(businessDirty(after))
    && hashS220Fact(baseline.database.counts) === hashS220Fact(current.database.counts)
    && hashS220Fact(baseline.database.inspection) === hashS220Fact(current.database.inspection)
    && baseline.attachments.sha256 === current.attachments.sha256;
  return { corePreserved, expectedDeliveryChanges, addedDeliveries, removedDeliveries };
}
