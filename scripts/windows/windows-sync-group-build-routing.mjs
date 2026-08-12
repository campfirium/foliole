export const WINDOWS_SYNC_GROUP_ACTIONS = [
  'multi-device-sync-a-leave', 'multi-device-sync-a-rejoin', 'multi-device-sync-c',
  'multi-device-sync-candidate'
];

export function isWindowsSyncGroupAction(action) {
  return WINDOWS_SYNC_GROUP_ACTIONS.includes(action);
}

export function preparesWindowsSyncGroupCandidate(action) {
  return action === 'multi-device-sync-candidate';
}

export function attachSyncGroupResult(summary, result) {
  for (const key of [
    'multiDeviceSyncALeave', 'multiDeviceSyncARejoin', 'multiDeviceSyncC', 'multiDeviceSyncCandidate'
  ]) {
    if (result?.[key]) summary[key] = result[key];
  }
}

export function printSyncGroupResult(stream, summary) {
  const values = [
    ['multiDeviceSyncALeave', 'multi-device-sync-a-leave', 'manifestPath'],
    ['multiDeviceSyncARejoin', 'multi-device-sync-a-rejoin', 'manifestPath'],
    ['multiDeviceSyncC', 'multi-device-sync-c', 'manifestPath'],
    ['multiDeviceSyncCandidate', 'multi-device-sync-candidate', 'manifestPath']
  ];
  for (const [key, action, field] of values) {
    if (summary[key]) stream(`[windows-dev-action] ${action} identity=${summary.runId} manifest=${summary[key][field]}`);
  }
}
