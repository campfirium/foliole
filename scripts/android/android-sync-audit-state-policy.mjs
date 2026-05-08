import { SYNC_OBJECT_POLICIES } from '../../lib/core/sync/syncObjectPolicy.ts';

function tableExists(db, table) {
  return db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table) !== undefined;
}

function countRows(db, table, where = '1 = 1', params = []) {
  if (!tableExists(db, table)) return 0;
  return db.prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE ${where}`).get(...params)?.count ?? 0;
}

function syncStateCount(db, objectType) {
  return countRows(db, 'sync_object_state', 'object_type = ?', [objectType]);
}

function policyRowCount(db, policy) {
  if (policy.objectType) return syncStateCount(db, policy.objectType);
  return policy.storage.reduce((sum, table) => sum + countRows(db, table), 0);
}

function policyBreakdown(db, deviceId = null) {
  const rows = SYNC_OBJECT_POLICIES.map((policy) => ({
    category: policy.category,
    count: policyRowCount(db, policy),
    deviceScope: policy.deviceScope,
    key: policy.key,
    pushIssue: policy.pushIssue
  }));
  return {
    categories: categoryCounts(rows),
    devicePrivate: devicePrivateSummary(db, deviceId),
    rows
  };
}

function categoryCounts(rows) {
  const counts = new Map();
  for (const row of rows) {
    const key = `${row.category}:${row.deviceScope}`;
    counts.set(key, (counts.get(key) ?? 0) + row.count);
  }
  return [...counts.entries()].map(([key, count]) => {
    const [category, deviceScope] = key.split(':');
    return { category, count, deviceScope };
  });
}

function devicePrivateSummary(db, deviceId) {
  return {
    localDeviceId: deviceId,
    nodeReadingDeviceStateRows: countRows(db, 'node_reading_device_state'),
    nodeViewStateRows: countRows(db, 'node_view_state'),
    nonLocalNodeReadingDeviceStateRows: deviceId ? countRows(db, 'node_reading_device_state', 'device_id <> ?', [deviceId]) : null,
    nonLocalNodeViewStateRows: deviceId ? countRows(db, 'node_view_state', 'device_id <> ?', [deviceId]) : null,
    viewStateSyncRows: syncStateCount(db, 'view_state')
  };
}

export { policyBreakdown };
