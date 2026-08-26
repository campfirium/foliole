const ACTION_OVERRIDES = Object.freeze({
  build: { deviceLeaseMode: null, formalTarget: 'build-capsule',
    formalTargetIdentity: 'accepted-source-archive', mutatesFixedA5: false },
  'hidden-desktop-status': { deviceLeaseMode: null, mutatesFixedA5: false,
    formalTarget: 'hidden-desktop-runtime', formalTargetIdentity: 'macos-hidden-native',
    requiresHiddenDesktopRuntime: true },
  status: { deviceLeaseMode: 'readonly-lifecycle', formalSourceClass: 'source-free-readonly',
    mutatesFixedA5: false },
  'sync-group-stopped-status': { formalSourceClass: 'ordinary-only' },
  'leave-sync-group': { requiresHiddenDesktopRuntime: true },
  'pair-credentials': { requiresHiddenDesktopRuntime: true },
  'single-principal-sync-group': { requiresHiddenDesktopRuntime: true },
  'system-entry-sync': { requiresHiddenDesktopRuntime: true },
  'sync-existing': { requiresHiddenDesktopRuntime: true },
  'sync-now': { requiresHiddenDesktopRuntime: true },
  'sync-group-rejoin': { requiresHiddenDesktopRuntime: true },
  'sync-group-rejoin-recover': { requiresHiddenDesktopRuntime: true }
});
const FORMAL_EVIDENCE = Object.freeze({
  'capture-annotation': { kind: 'run-directory', root: 'a5-capture-annotation' },
  'clear-app-data': { kind: 'run-json', root: 'a5-clear-app-data' },
  'database-performance': { kind: 'run-directory', root: 'companion-database-performance' },
  deploy: { kind: 'run-directory', root: 'a5-deploy' },
  'device-profile': { kind: 'run-directory', root: 'a5-device-profile' },
  'hidden-desktop-status': { kind: 'run-json', root: 'a5-hidden-desktop-status' },
  'leave-sync-group': { kind: 'run-directory', root: 'a5-sync-group-maintenance' },
  'pair-credentials': { kind: 'run-directory', root: 'a5-pair-credentials' },
  'single-principal-sync-group': {
    kind: 'run-directory', root: 'a5-single-principal-sync-group'
  },
  'system-entry-sync': { kind: 'run-directory', root: 'a5-system-entry-sync' },
  'sync-group-join-prepare': { kind: 'run-directory', root: 'a5-sync-group-join-prepare' },
  'sync-existing': { kind: 'run-directory', root: 'a5-existing-sync' },
  'sync-now': { kind: 'run-directory', root: 'a5-sync-now' },
  'sync-group-rejoin': { kind: 'run-directory', root: 'a5-sync-group-rejoin' },
  'sync-group-rejoin-recover': {
    kind: 'run-directory', root: 'a5-sync-group-rejoin-recovery'
  }
});
const MACOS_A5_ACTIONS = new Set([
  ...Object.keys(ACTION_OVERRIDES),
  'capture-annotation', 'clear-app-data', 'database-performance', 'deploy',
  'device-profile', 'leave-sync-group', 'pair-credentials', 'system-entry-sync', 'sync-existing',
  'sync-group-join-prepare', 'sync-group-rejoin', 'sync-group-rejoin-recover',
  'sync-group-stopped-status', 'sync-now', 'single-principal-sync-group'
]);

export function assertRegisteredMacosA5Action(action) {
  if (!MACOS_A5_ACTIONS.has(action)) {
    throw new Error('Usage: node scripts/android/macos-a5-dev.mjs <registered-action>');
  }
  return Object.freeze({ action, deviceLeaseMode: 'mutation', formalSourceClass: 'frozen-build',
    formalEvidence: FORMAL_EVIDENCE[action] ?? Object.freeze({ kind: 'receipt' }),
    formalTarget: 'fixed-a5',
    formalTargetIdentity: '87a33a4b',
    mutatesFixedA5: true, requiresHiddenDesktopRuntime: false,
    ...ACTION_OVERRIDES[action] });
}

export function assertFormalMacosA5Action(actionContract) {
  if (!['frozen-build', 'source-free-readonly'].includes(actionContract.formalSourceClass)) {
    throw new Error(`Formal A5 acceptance is unavailable for ${actionContract.action}.`);
  }
  return actionContract;
}
