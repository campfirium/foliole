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
  if (action === WINDOWS_DEV_CAPTURE_ANNOTATION_WIRE_ACTION) return WINDOWS_DEV_CAPTURE_ANNOTATION_ACTION;
  if (action === WINDOWS_DEV_DEVICE_PROFILE_WIRE_ACTION) return WINDOWS_DEV_DEVICE_PROFILE_ACTION;
  return action;
}
