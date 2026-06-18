/* global process */

const WAIT_ANNOUNCE_MS = 5_000;

function readDurationMs(env, key, defaultValue) {
  const rawValue = env[key];
  if (rawValue === undefined) {
    return defaultValue;
  }
  const parsedValue = Number.parseInt(rawValue, 10);
  if (!Number.isFinite(parsedValue) || parsedValue < 0) {
    throw new Error(`${key} must be a non-negative integer`);
  }
  return parsedValue;
}

export function createPreviewWaitAnnouncer(env = process.env) {
  const waitAnnounceMs = readDurationMs(env, 'PREVIEW_DEDUPE_WAIT_ANNOUNCE_MS', WAIT_ANNOUNCE_MS);
  let announcedWaitAt = 0;
  let announcedWaitKey = null;
  return {
    shouldAnnounce(action, runId, now = Date.now()) {
      const waitKey = `${runId}:${action.reason}`;
      if (announcedWaitKey === waitKey && now - announcedWaitAt < waitAnnounceMs) {
        return false;
      }
      announcedWaitAt = now;
      announcedWaitKey = waitKey;
      return true;
    }
  };
}
