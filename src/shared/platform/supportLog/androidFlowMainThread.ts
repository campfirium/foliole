export const mainThreadSources = ['longtask', 'interval'] as const;

export type MainThreadSummary = { source: typeof mainThreadSources[number]; longTasks: number; maxMs: number };

const intervalMs = 100;
const longTaskMs = 50;
export const maxRecordedMs = 300_000;

/** Summarizes JavaScript event-loop stalls while a support recording is active. */
export function startMainThreadSampler(): () => MainThreadSummary {
  const summary: MainThreadSummary = { source: 'interval', longTasks: 0, maxMs: 0 };
  const record = (durationMs: number) => {
    if (durationMs < longTaskMs) return;
    summary.longTasks += 1;
    summary.maxMs = Math.min(maxRecordedMs, Math.max(summary.maxMs, Math.round(durationMs)));
  };
  if (typeof PerformanceObserver !== 'undefined' && PerformanceObserver.supportedEntryTypes?.includes('longtask')) {
    summary.source = 'longtask';
    const observer = new PerformanceObserver(list => { for (const entry of list.getEntries()) record(entry.duration); });
    observer.observe({ type: 'longtask', buffered: false });
    return () => {
      for (const entry of observer.takeRecords()) record(entry.duration);
      observer.disconnect();
      return { ...summary };
    };
  }
  let expected = performance.now() + intervalMs;
  const timer = setInterval(() => {
    const now = performance.now();
    record(now - expected);
    expected = now + intervalMs;
  }, intervalMs);
  return () => {
    clearInterval(timer);
    return { ...summary };
  };
}
