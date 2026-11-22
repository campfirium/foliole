import { getElectronAPI } from '../electronApi';
import { logRuntimeEvent } from '../runtimeLogging';

/**
 * Always-on record of renderer long tasks (main thread busy ≥ 50 ms, as the browser reports them). One task ≥ 1 s is
 * logged at once; per hour the count, total and longest are logged once when the hour closes or the page hides, so
 * steady background jank shows up even when no single task looks slow. Only numbers are kept.
 */
export const RENDERER_LONG_TASK_SLOW_MS = 1000;
export const RENDERER_LONG_TASK_SUMMARY_MIN_TOTAL_MS = 2000;

const HOUR_MS = 3_600_000;
const SLOW_REPEAT_WINDOW_MS = 60_000;

type HourSummary = { hourStart: number; count: number; totalMs: number; maxMs: number };

let hour: HourSummary | null = null;
let lastSlowLoggedAt = -Infinity;

export function recordRendererLongTask(durationMs: number, now = Date.now()) {
  const ms = Math.max(0, Math.round(durationMs));
  const hourStart = Math.floor(now / HOUR_MS) * HOUR_MS;
  if (hour && hour.hourStart !== hourStart) flushRendererLongTaskHour();
  hour ??= { hourStart, count: 0, totalMs: 0, maxMs: 0 };
  hour.count += 1;
  hour.totalMs += ms;
  hour.maxMs = Math.max(hour.maxMs, ms);
  if (ms >= RENDERER_LONG_TASK_SLOW_MS && now - lastSlowLoggedAt >= SLOW_REPEAT_WINDOW_MS) {
    lastSlowLoggedAt = now;
    logRuntimeEvent({ event: 'renderer_long_task', level: 'info', occurredAt: new Date(now).toISOString(),
      payload: { durationMs: ms }, source: 'renderer.native' });
  }
}

/** Logs the open hour once if it held enough long-task time to matter, then starts a fresh hour. */
export function flushRendererLongTaskHour() {
  const closed = hour;
  hour = null;
  if (!closed || closed.totalMs < RENDERER_LONG_TASK_SUMMARY_MIN_TOTAL_MS) return;
  logRuntimeEvent({ event: 'renderer_long_tasks', level: 'info', occurredAt: new Date(closed.hourStart).toISOString(),
    payload: { count: closed.count, totalMs: closed.totalMs, maxMs: closed.maxMs }, source: 'renderer.native' });
}

/** Desktop only: without the native diagnostic log (browser Demo, tests) nothing is observed. */
export function installRendererLongTaskLog() {
  if (!getElectronAPI()?.logDiagnosticEvent) return () => undefined;
  if (typeof PerformanceObserver === 'undefined' || !PerformanceObserver.supportedEntryTypes?.includes('longtask')) {
    return () => undefined;
  }
  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) recordRendererLongTask(entry.duration);
  });
  observer.observe({ type: 'longtask', buffered: true });
  const flushOnHide = () => { if (document.visibilityState === 'hidden') flushRendererLongTaskHour(); };
  document.addEventListener('visibilitychange', flushOnHide);
  window.addEventListener('pagehide', flushRendererLongTaskHour);
  return () => {
    observer.disconnect();
    document.removeEventListener('visibilitychange', flushOnHide);
    window.removeEventListener('pagehide', flushRendererLongTaskHour);
  };
}

export function resetRendererLongTaskLogForTests() {
  hour = null;
  lastSlowLoggedAt = -Infinity;
}
