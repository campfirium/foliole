import type { FlowTimingStage } from '../../../../lib/core/flow/flowTiming';

import type { FlowEntry } from './androidFlowTimingReport';

type Window = { start: number; end: number };

/** Each Flow operation spans its first stamp until every started stage settles, or the recording cutoff. */
export function flowActionWindows(events: readonly FlowEntry[], cutoff: number): Window[] {
  const windows = new Map<number, Window & { pending: Set<FlowTimingStage> }>();
  for (const event of events) {
    const window = windows.get(event.operation) ?? { start: event.atMs, end: event.atMs, pending: new Set() };
    window.end = event.atMs;
    if (event.status === 'start') window.pending.add(event.stage);
    else window.pending.delete(event.stage);
    windows.set(event.operation, window);
  }
  return [...windows.values()].map(window => ({ start: window.start, end: window.pending.size ? cutoff : window.end }));
}

export function overlapping<T extends { fromMs: number; toMs: number }>(entries: readonly T[], windows: readonly Window[]) {
  return entries.filter(entry => windows.some(window => entry.fromMs <= window.end && entry.toMs >= window.start));
}
