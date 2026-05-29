/* global process */

const DEFAULT_COMMAND_BUDGET_MS = { android: 4 * 60_000, windows: 4 * 60_000 };
const DEFAULT_MAX_SETTLE_MS = { android: 0, windows: 0 };
const DEFAULT_SETTLE_MS = { android: 0, windows: 0 };
const DEFAULT_WINDOW_MS = { android: 0, windows: 0 };

export function readDurationMs(env, key, defaultValue) {
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

export function readWindowMs(target, env = process.env) {
  return readDurationMs(
    env,
    `PREVIEW_DEDUPE_${target.toUpperCase()}_WINDOW_MS`,
    readDurationMs(env, `PREVIEW_DEDUPE_${target.toUpperCase()}_COOLDOWN_MS`, DEFAULT_WINDOW_MS[target] ?? 0)
  );
}

export function readSettleMs(target, env = process.env) {
  return readDurationMs(
    env,
    `PREVIEW_DEDUPE_${target.toUpperCase()}_SETTLE_MS`,
    readDurationMs(env, 'PREVIEW_DEDUPE_SETTLE_MS', DEFAULT_SETTLE_MS[target] ?? 0)
  );
}

export function readMaxSettleMs(target, env = process.env) {
  return readDurationMs(
    env,
    `PREVIEW_DEDUPE_${target.toUpperCase()}_MAX_SETTLE_MS`,
    readDurationMs(env, 'PREVIEW_DEDUPE_MAX_SETTLE_MS', DEFAULT_MAX_SETTLE_MS[target] ?? 0)
  );
}

export function readTotalTimeoutMs(target, windowMs = readWindowMs(target), env = process.env, maxSettleMs = readMaxSettleMs(target, env)) {
  return readDurationMs(
    env,
    `PREVIEW_DEDUPE_${target.toUpperCase()}_TOTAL_TIMEOUT_MS`,
    readDurationMs(env, 'PREVIEW_DEDUPE_TOTAL_TIMEOUT_MS', maxSettleMs + windowMs + (DEFAULT_COMMAND_BUDGET_MS[target] ?? 4 * 60_000))
  );
}
