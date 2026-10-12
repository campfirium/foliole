export const WINDOWS_DEV_CAPTURE_ANNOTATION_ACTION = 'capture-annotation';
export const WINDOWS_DEV_DEVICE_PROFILE_ACTION = 'device-profile';

// COMPAT(windows-dev-capture-annotation-bootstrap): pre-003370 wrappers accept alphabetic actions only.
export const WINDOWS_DEV_CAPTURE_ANNOTATION_WIRE_ACTION = 'captureannotation';
export const WINDOWS_DEV_DEVICE_PROFILE_WIRE_ACTION = 'deviceprofile';

export function toWindowsDevWireAction(action) {
  if (action === WINDOWS_DEV_CAPTURE_ANNOTATION_ACTION) return WINDOWS_DEV_CAPTURE_ANNOTATION_WIRE_ACTION;
  if (action === WINDOWS_DEV_DEVICE_PROFILE_ACTION) return WINDOWS_DEV_DEVICE_PROFILE_WIRE_ACTION;
  return action;
}

export function normalizeWindowsDevAction(action) {
  if (['sync-sqlite-diagnostic-micro', 'sync-sqlite-diagnostic-download', 'sync-sqlite-diagnostic-offline', 'sync-sqlite-diagnostic-snapshot'].includes(action)) return 'sync-sqlite-diagnostic';
  if (action === WINDOWS_DEV_CAPTURE_ANNOTATION_WIRE_ACTION) return WINDOWS_DEV_CAPTURE_ANNOTATION_ACTION;
  if (action === WINDOWS_DEV_DEVICE_PROFILE_WIRE_ACTION) return WINDOWS_DEV_DEVICE_PROFILE_ACTION;
  return action;
}

export function extractSqliteDiagnosticMode(argv) {
  const args = [...argv];
  const index = args.indexOf('--mode');
  if (index < 0) return { args };
  const [, diagnosticMode] = args.splice(index, 2);
  if (!args.includes('sync-sqlite-diagnostic') || !['micro', 'download', 'offline', 'snapshot'].includes(diagnosticMode)) {
    throw new Error('Only sync-sqlite-diagnostic --mode micro, download, offline or snapshot is supported');
  }
  return { args, diagnosticMode };
}
