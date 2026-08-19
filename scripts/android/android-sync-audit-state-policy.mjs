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

function policyBreakdown(db, hostName = null) {
  const rows = SYNC_OBJECT_POLICIES.map((policy) => ({
    category: policy.category,
    count: policyRowCount(db, policy),
    scope: policy.scope,
    key: policy.key,
    pushIssue: policy.pushIssue
  }));
  return {
    categories: categoryCounts(rows),
    hostPrivate: hostPrivateSummary(db, hostName),
    rows
  };
}

function categoryCounts(rows) {
  const counts = new Map();
  for (const row of rows) {
    const key = `${row.category}:${row.scope}`;
    counts.set(key, (counts.get(key) ?? 0) + row.count);
  }
  return [...counts.entries()].map(([key, count]) => {
    const [category, scope] = key.split(':');
    return { category, count, scope };
  });
}

function hostPrivateSummary(db, hostName) {
  return {
    currentHostName: hostName,
    nodeReadingHostStateRows: countRows(db, 'node_reading_host_state'),
    nodeViewStateRows: countRows(db, 'node_view_state'),
    nonLocalNodeReadingHostStateRows: hostName ? countRows(db, 'node_reading_host_state', 'host_name <> ?', [hostName]) : null,
    nonLocalNodeViewStateRows: hostName ? countRows(db, 'node_view_state', 'host_name <> ?', [hostName]) : null,
    viewStateSyncRows: syncStateCount(db, 'view_state')
  };
}

export { policyBreakdown };
