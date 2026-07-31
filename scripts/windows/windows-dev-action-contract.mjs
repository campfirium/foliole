export const WINDOWS_DEV_CAPTURE_ANNOTATION_ACTION = 'capture-annotation';

// COMPAT(windows-dev-capture-annotation-bootstrap): pre-003370 wrappers accept alphabetic actions only.
export const WINDOWS_DEV_CAPTURE_ANNOTATION_WIRE_ACTION = 'captureannotation';

export function toWindowsDevWireAction(action) {
  return action === WINDOWS_DEV_CAPTURE_ANNOTATION_ACTION
    ? WINDOWS_DEV_CAPTURE_ANNOTATION_WIRE_ACTION
    : action;
}

export function normalizeWindowsDevAction(action) {
  return action === WINDOWS_DEV_CAPTURE_ANNOTATION_WIRE_ACTION
    ? WINDOWS_DEV_CAPTURE_ANNOTATION_ACTION
    : action;
}
