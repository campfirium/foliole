const ACTION_OVERRIDES = Object.freeze({
  build: { deviceLeaseMode: null, mutatesFixedA5: false },
  status: { deviceLeaseMode: 'readonly-lifecycle', mutatesFixedA5: false }
});
const MACOS_A5_ACTIONS = new Set([
  ...Object.keys(ACTION_OVERRIDES),
  'capture-annotation', 'clear-app-data', 'database-performance', 'deploy',
  'device-profile', 'leave-sync-group', 'pair-credentials', 'pair-sync', 'sync-existing',
  'sync-group-rejoin', 'sync-group-rejoin-recover', 'sync-group-stopped-status'
]);

export function assertRegisteredMacosA5Action(action) {
  if (!MACOS_A5_ACTIONS.has(action)) {
    throw new Error('Usage: node scripts/android/macos-a5-dev.mjs <registered-action>');
  }
  return Object.freeze({ action, deviceLeaseMode: 'mutation', mutatesFixedA5: true,
    ...ACTION_OVERRIDES[action] });
}
