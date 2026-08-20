const MACOS_A5_ACTIONS = new Set([
  'build', 'capture-annotation', 'clear-app-data', 'database-performance', 'deploy',
  'device-profile', 'pair-credentials', 'pair-sync', 'status', 'sync-existing',
  'sync-group-rejoin', 'sync-group-rejoin-recover', 'sync-group-stopped-status'
]);

export function assertRegisteredMacosA5Action(action) {
  if (!MACOS_A5_ACTIONS.has(action)) {
    throw new Error('Usage: node scripts/android/macos-a5-dev.mjs <registered-action>');
  }
}
