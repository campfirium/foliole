export const WINDOWS_SYNC_GROUP_ACTIONS = [
  'desktop-dnssd-route-prepare', 'desktop-dnssd-route-provider',
  'desktop-dnssd-route-selfcheck',
  'multi-device-sync-a-leave', 'multi-device-sync-a-rejoin', 'multi-device-sync-c',
  'multi-device-sync-candidate', 'multi-device-sync-from-zero', 'multi-device-sync-participation',
  'single-principal-sync-group', 'two-device-sync-provider'
];

export function isWindowsSyncGroupAction(action) {
  return WINDOWS_SYNC_GROUP_ACTIONS.includes(action);
}

export function preparesWindowsSyncGroupCandidate(action) {
  return action === 'multi-device-sync-candidate';
}

export function attachSyncGroupResult(summary, result) {
  for (const key of [
    'desktopDnsSdRoutePrepare',
    'desktopDnsSdRouteProvider',
    'desktopDnsSdRouteControllerSelfcheck',
    'multiDeviceSyncALeave', 'multiDeviceSyncARejoin', 'multiDeviceSyncC', 'multiDeviceSyncCandidate',
    'multiDeviceSyncFromZero', 'multiDeviceSyncParticipation', 'singlePrincipalSyncGroup',
    'twoDeviceSyncProvider'
  ]) {
    if (result?.[key]) summary[key] = result[key];
  }
}

export function printSyncGroupResult(stream, summary) {
  const values = [
    ['desktopDnsSdRoutePrepare', 'desktop-dnssd-route-prepare', 'manifestPath'],
    ['desktopDnsSdRouteProvider', 'desktop-dnssd-route-provider', 'manifestPath'],
    ['desktopDnsSdRouteControllerSelfcheck', 'desktop-dnssd-route-selfcheck', 'manifestPath'],
    ['multiDeviceSyncALeave', 'multi-device-sync-a-leave', 'manifestPath'],
    ['multiDeviceSyncARejoin', 'multi-device-sync-a-rejoin', 'manifestPath'],
    ['multiDeviceSyncC', 'multi-device-sync-c', 'manifestPath'],
    ['multiDeviceSyncCandidate', 'multi-device-sync-candidate', 'manifestPath'],
    ['multiDeviceSyncFromZero', 'multi-device-sync-from-zero', 'manifestPath'],
    ['multiDeviceSyncParticipation', 'multi-device-sync-participation', 'manifestPath'],
    ['singlePrincipalSyncGroup', 'single-principal-sync-group', 'manifestPath'],
    ['twoDeviceSyncProvider', 'two-device-sync-provider', 'manifestPath']
  ];
  for (const [key, action, field] of values) {
    if (summary[key]) stream(`[windows-dev-action] ${action} identity=${summary.runId} manifest=${summary[key][field]}`);
  }
}
