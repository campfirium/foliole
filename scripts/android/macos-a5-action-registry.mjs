const ACTION_OVERRIDES = Object.freeze({
  build: { deviceLeaseMode: null, mutatesFixedA5: false },
  'hidden-desktop-status': { deviceLeaseMode: null, mutatesFixedA5: false,
    requiresHiddenDesktopRuntime: true },
  status: { deviceLeaseMode: 'readonly-lifecycle', formalSourceClass: 'source-free-readonly',
    mutatesFixedA5: false },
  'sync-group-stopped-status': { formalSourceClass: 'ordinary-only' },
  'leave-sync-group': { requiresHiddenDesktopRuntime: true },
  'pair-credentials': { requiresHiddenDesktopRuntime: true },
  'pair-sync': { requiresHiddenDesktopRuntime: true },
  'sync-existing': { requiresHiddenDesktopRuntime: true },
  'sync-group-rejoin': { requiresHiddenDesktopRuntime: true },
  'sync-group-rejoin-recover': { requiresHiddenDesktopRuntime: true }
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
  return Object.freeze({ action, deviceLeaseMode: 'mutation', formalSourceClass: 'frozen-build',
    mutatesFixedA5: true, requiresHiddenDesktopRuntime: false,
    ...ACTION_OVERRIDES[action] });
}

export function assertFormalMacosA5Action(actionContract) {
  if (!['frozen-build', 'source-free-readonly'].includes(actionContract.formalSourceClass)) {
    throw new Error(`Formal A5 acceptance is unavailable for ${actionContract.action}.`);
  }
  return actionContract;
}
