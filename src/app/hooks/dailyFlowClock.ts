import { getDemoRuntimeNowIso, subscribeDemoRuntimeState } from '../../shared/platform/runtime/demoRuntime';

/**
 * The longest the clock waits when no view named a change: readiness a view could not predict, and a wall
 * clock moved by hand, still appear within this time.
 */
export const DAILY_FLOW_CLOCK_MAX_WAIT_MS = 10 * 60_000;
const MIN_WAIT_MS = 1_000;
// A row is doable at its due instant; waking just after it keeps the next read from seeing it as still early.
const DUE_MARGIN_MS = 50;

type Listener = () => void;

const listeners = new Set<Listener>();
let nowIso: string | null = null;
let advancedAtMs = 0;
let wakeAtMs: number | null = null;
let dueAtMs = 0;
let timer: ReturnType<typeof setTimeout> | null = null;
let releaseRuntime: (() => void) | null = null;

function clockNow() {
  if (nowIso === null) {
    nowIso = getDemoRuntimeNowIso();
    advancedAtMs = Date.now();
  }
  return nowIso;
}

function schedule() {
  if (timer !== null) clearTimeout(timer);
  timer = null;
  if (!listeners.size) return;
  const clockMs = Date.parse(clockNow());
  const target = wakeAtMs !== null && wakeAtMs > clockMs ? wakeAtMs + DUE_MARGIN_MS : clockMs + DAILY_FLOW_CLOCK_MAX_WAIT_MS;
  const elapsed = Date.now() - advancedAtMs;
  const delay = Math.min(DAILY_FLOW_CLOCK_MAX_WAIT_MS, Math.max(MIN_WAIT_MS, target - clockMs - elapsed));
  dueAtMs = Date.now() + delay;
  timer = setTimeout(advance, delay);
}

function advance() {
  nowIso = getDemoRuntimeNowIso();
  advancedAtMs = Date.now();
  wakeAtMs = null;
  schedule();
  listeners.forEach(listener => listener());
}

// Timers can stop while the machine sleeps; returning to the window catches up a wake that is already due.
function catchUp() {
  if (timer !== null && Date.now() >= dueAtMs) advance();
}

function onVisibility() {
  if (document.visibilityState === 'visible') catchUp();
}

/**
 * Flow availability changes only when its data changes or a known instant passes, so the shared `now` moves
 * at those instants instead of on a fixed tick that would re-read Flow and re-render the workspace for nothing.
 */
export function subscribeDailyFlowClock(listener: Listener) {
  listeners.add(listener);
  if (listeners.size === 1) {
    clockNow();
    const releaseDemo = subscribeDemoRuntimeState(advance);
    window.addEventListener('focus', catchUp);
    document.addEventListener('visibilitychange', onVisibility);
    releaseRuntime = () => {
      releaseDemo();
      window.removeEventListener('focus', catchUp);
      document.removeEventListener('visibilitychange', onVisibility);
    };
    schedule();
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size) return;
    releaseRuntime?.();
    releaseRuntime = null;
    wakeAtMs = null;
    // The next first reader starts from the time it mounts, not from when the last one left.
    nowIso = null;
    schedule();
  };
}

export function getDailyFlowClockNow() {
  return clockNow();
}

/** A view read at the clock's current `now` names when time alone can next change it. */
export function requestDailyFlowClockWake(readAt: string, changeAt: string | undefined) {
  if (readAt !== nowIso) return;
  const at = changeAt ? Date.parse(changeAt) : Number.NaN;
  if (!Number.isFinite(at)) return;
  if (wakeAtMs !== null && wakeAtMs <= at) return;
  wakeAtMs = at;
  schedule();
}
