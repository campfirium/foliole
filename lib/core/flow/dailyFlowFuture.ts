import { resolveReviewQueueReadingAvailableAt } from '../review/queue/reviewQueuePlannerReadingPaths.js';
import type { ReviewSessionMode } from '../review/queue/reviewQueueTypes.js';
import { resolveStoredReviewDueAt } from '../review/reviewDayBoundary.js';
import { isFsrsReviewItemNode } from '../review/reviewItemKind.js';

import { cycleReadyNodeIds } from './cycleFlowSelection.js';
import type { DailyFlowSettings } from './dailyFlowContract.js';
import { flowDay, flowPlan, prepareFlowSession } from './dailyFlowPlanning.js';
import type { DailyFlowStore } from './dailyFlowStore.js';

export type DailyFlowFutureArgs = { now: string; mode: ReviewSessionMode; includeEntries: boolean };
export type DailyFlowFutureView = { scope: string; dayKey: string; now: string; mode: ReviewSessionMode;
  hasFuture: boolean; dayBuckets: { dayOffset: number; nodeIds: string[] }[] | null };

// Future groups describe the first available day under saved facts, without hypothetical grades.
export async function readDailyFlowFuture(store: DailyFlowStore, args: DailyFlowFutureArgs,
  settings: DailyFlowSettings): Promise<DailyFlowFutureView> {
  const snapshot = await store.learningSnapshot();
  const scheduled = flowPlan(snapshot, args.mode, args.now, settings, true);
  const ids = [...new Set([...scheduled.queueNodeIds, ...scheduled.fsrsQueueNodeIds, ...scheduled.readingQueueNodeIds])];
  const days = new Map<number, string[]>();
  const today = flowDay(args.now, settings);
  for (const id of ids) {
    const node = snapshot.nodesById[id]!;
    const available = isFsrsReviewItemNode(node) ? resolveStoredReviewDueAt({ due: node.review?.due ?? node.createdAt,
      scheduledDays: node.review?.scheduledDays ?? 0, newDayStartsAtHour: settings.newDayStartsAtHour })
      : resolveReviewQueueReadingAvailableAt(node, settings.newDayStartsAtHour);
    const offset = Math.round((Date.parse(flowDay(available, settings)) - Date.parse(today)) / 86_400_000);
    if (offset <= 0) continue;
    const group = days.get(offset) ?? [];
    group.push(id);
    days.set(offset, group);
  }
  const dayBuckets = [...days.entries()].sort(([left], [right]) => left - right).map(([dayOffset, members]) => {
    const end = new Date(today);
    end.setDate(end.getDate() + dayOffset + 1);
    const now = new Date(end.getTime() - 1).toISOString();
    const initial = prepareFlowSession(snapshot, { now, mode: args.mode, prepareOnly: true }, settings);
    const ready = [...new Set([...initial.queueNodeIds, ...cycleReadyNodeIds(snapshot, args.mode, now, settings)])];
    const selected = new Set(members);
    return { dayOffset, nodeIds: ready.filter(id => selected.has(id)) };
  }).filter(bucket => bucket.nodeIds.length);
  return { scope: settings.scope ?? '', dayKey: today, now: args.now, mode: args.mode,
    hasFuture: dayBuckets.length > 0, dayBuckets: args.includeEntries ? dayBuckets : null };
}
