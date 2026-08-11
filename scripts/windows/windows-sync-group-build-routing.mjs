export const WINDOWS_SYNC_GROUP_ACTIONS = [
  'multi-device-sync-candidate'
];

export function isWindowsSyncGroupAction(action) {
  return WINDOWS_SYNC_GROUP_ACTIONS.includes(action);
}

export function attachSyncGroupResult(summary, result) {
  for (const key of ['multiDeviceSyncCandidate']) {
    if (result?.[key]) summary[key] = result[key];
  }
}

export function printSyncGroupResult(stream, summary) {
  const values = [
    ['multiDeviceSyncCandidate', 'multi-device-sync-candidate', 'manifestPath']
  ];
  for (const [key, action, field] of values) {
    if (summary[key]) stream(`[windows-dev-action] ${action} identity=${summary.runId} manifest=${summary[key][field]}`);
  }
}
