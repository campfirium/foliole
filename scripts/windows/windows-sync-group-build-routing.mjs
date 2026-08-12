export const WINDOWS_SYNC_GROUP_ACTIONS = [
  'multi-device-sync-a-rejoin', 'multi-device-sync-c', 'multi-device-sync-candidate'
];

export function isWindowsSyncGroupAction(action) {
  return WINDOWS_SYNC_GROUP_ACTIONS.includes(action);
}

export function preparesWindowsSyncGroupCandidate(action) {
  return action === 'multi-device-sync-candidate';
}

export function attachSyncGroupResult(summary, result) {
  for (const key of ['multiDeviceSyncARejoin', 'multiDeviceSyncC', 'multiDeviceSyncCandidate']) {
    if (result?.[key]) summary[key] = result[key];
  }
}

export function printSyncGroupResult(stream, summary) {
  const values = [
    ['multiDeviceSyncARejoin', 'multi-device-sync-a-rejoin', 'manifestPath'],
    ['multiDeviceSyncC', 'multi-device-sync-c', 'manifestPath'],
    ['multiDeviceSyncCandidate', 'multi-device-sync-candidate', 'manifestPath']
  ];
  for (const [key, action, field] of values) {
    if (summary[key]) stream(`[windows-dev-action] ${action} identity=${summary.runId} manifest=${summary[key][field]}`);
  }
}
