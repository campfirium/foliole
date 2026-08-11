export const WINDOWS_DEV_CAPTURE_ANNOTATION_ACTION = 'capture-annotation';
export const WINDOWS_DEV_DEVICE_PROFILE_ACTION = 'device-profile';
export const WINDOWS_DEV_PAIR_SYNC_RECOVERY_ACTION = 'pair-sync-recover';

// COMPAT(windows-dev-capture-annotation-bootstrap): pre-003370 wrappers accept alphabetic actions only.
export const WINDOWS_DEV_CAPTURE_ANNOTATION_WIRE_ACTION = 'captureannotation';
export const WINDOWS_DEV_DEVICE_PROFILE_WIRE_ACTION = 'deviceprofile';
export const WINDOWS_DEV_PAIR_SYNC_RECOVERY_WIRE_ACTION = 'pairsyncrecover';

export function toWindowsDevWireAction(action) {
  if (action === WINDOWS_DEV_CAPTURE_ANNOTATION_ACTION) return WINDOWS_DEV_CAPTURE_ANNOTATION_WIRE_ACTION;
  if (action === WINDOWS_DEV_DEVICE_PROFILE_ACTION) return WINDOWS_DEV_DEVICE_PROFILE_WIRE_ACTION;
  if (action === WINDOWS_DEV_PAIR_SYNC_RECOVERY_ACTION) return WINDOWS_DEV_PAIR_SYNC_RECOVERY_WIRE_ACTION;
  return action;
}

export function normalizeWindowsDevAction(action) {
  if (action === WINDOWS_DEV_CAPTURE_ANNOTATION_WIRE_ACTION) return WINDOWS_DEV_CAPTURE_ANNOTATION_ACTION;
  if (action === WINDOWS_DEV_DEVICE_PROFILE_WIRE_ACTION) return WINDOWS_DEV_DEVICE_PROFILE_ACTION;
  if (action === WINDOWS_DEV_PAIR_SYNC_RECOVERY_WIRE_ACTION) return WINDOWS_DEV_PAIR_SYNC_RECOVERY_ACTION;
  return action;
}
