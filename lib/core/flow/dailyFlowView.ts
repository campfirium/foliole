import type { ReviewSessionMode } from '../review/queue/reviewQueueTypes.js';
import { resolveNextDayStart } from '../review/reviewDayBoundary.js';
import type { DbPort } from '../sync/dbPort.js';

import { cycleScanFilter, deriveCycleReadiness } from './cycleFlowReadiness.js';
import { cycleReadyNodeIds } from './cycleFlowSelection.js';
import type { DailyFlowLearningSnapshot, DailyFlowSettings } from './dailyFlowContract.js';
import { dailyFlowSettingsForInstant, isFlowWindowUnexpired } from './dailyFlowDayWindow.js';
import { flowDay } from './dailyFlowPlanning.js';
import type { DailyFlowPersistence } from './dailyFlowService.js';
import { createSqliteDailyFlowStore } from './dailyFlowSqliteStore.js';
import type { CycleStored, DailyFlowStore } from './dailyFlowStore.js';
import type { DailyFlowView, DailyFlowViewArgs, DailyFlowViewResult } from './dailyFlowViewContract.js';
import { matchesDivePhase } from './diveCycleFlow.js';
import { readDiveUnreadRound } from './diveUnreadTopics.js';

/**
 * The first instant after `now` at which time alone can change this view: a waiting row becomes doable or the day ends.
 * Until then the same stored rows and learning give the same view, so a reader need not ask again.
 */
function nextFlowChangeAt(now: string, settings: DailyFlowSettings, snapshot?: DailyFlowLearningSnapshot, ids: readonly string[] = []) {
  let next = settings.dayWindow && isFlowWindowUnexpired(settings.dayWindow, now) ? Date.parse(settings.dayWindow.end)
    : resolveNextDayStart(new Date(now), settings.newDayStartsAtHour).getTime();
  if (snapshot) for (const readiness of deriveCycleReadiness(snapshot, ids, now, settings).values()) {
    if (readiness.ready_at_ms !== null && readiness.ready_at_ms < next) next = readiness.ready_at_ms;
  }
  return new Date(next).toISOString();
}

export function readDailyFlowView(db: DbPort, args: DailyFlowViewArgs, settings: DailyFlowSettings,
  persistence: DailyFlowPersistence): Promise<DailyFlowViewResult> {
  return db.transaction(async tx => readStoredDailyFlowView(createSqliteDailyFlowStore(tx, persistence), args,
    await dailyFlowSettingsForInstant(tx, settings, args.now)));
}

export async function readStoredDailyFlowView(store: DailyFlowStore, args: DailyFlowViewArgs, settings: DailyFlowSettings): Promise<DailyFlowViewResult> {
    const stored = await store.readState();
    if (!stored || stored.invalidated || stored.day_key !== flowDay(args.now, settings) ||
      stored.settings_key !== JSON.stringify(settings)) return { status: 'needs-preparation' };
    if (args.dive) return readDiveView(store, stored, args, args.dive, settings);
    const rows = (await store.readRows()).filter(row => row.active);
    const ids = rows.map(row => row.node_id);
    const snapshot = await store.scopedLearningSnapshot(ids);
    const modes: ReviewSessionMode[] = ['recommended', 'review-first', 'reading-only'];
    const ready = Object.fromEntries(modes.map(mode => [mode,
      new Set(cycleReadyNodeIds({ ...snapshot, nodeOrder: ids }, mode, args.now, settings))])) as Record<ReviewSessionMode, Set<string>>;
    const available = (mode: ReviewSessionMode) => ids.some(id => ready[mode].has(id));
    const current = stored.session.currentNodeId;
    const currentNodeId = current && ready[args.mode].has(current) && ids.includes(current) ? current : null;
    const meta = stored.session.cycle!;
    const cursor = meta.timedResume?.key === meta.scanAfter ? meta.timedResume.after : meta.scanAfter;
    const ordered = args.includeEntries ? [...new Set([
      ...(currentNodeId ? [currentNodeId] : []),
      ...rows.filter(row => row.order_key > cursor && row.order_key <= meta.lapLimit).map(row => row.node_id),
      ...rows.filter(row => row.order_key <= meta.tailKey).map(row => row.node_id)
    ])].filter(id => ready[args.mode].has(id)) : null;
    const target = args.continueNodeId;
    return { status: 'ready', scope: settings.scope ?? '', dayKey: stored.day_key, revision: stored.revision,
      now: args.now, mode: args.mode, currentNodeId, nodeIds: ordered, complete: args.includeEntries,
      modeAvailability: { recommended: available('recommended'), 'review-first': available('review-first'),
        'reading-only': available('reading-only') }, nextChangeAt: nextFlowChangeAt(args.now, settings, snapshot, ids),
      canContinueReading: Boolean(!stored.session.currentNodeId && target && target === stored.session.continueNodeId &&
        (stored.session.reviewedItemCount ?? 0) > 0 && args.mode !== 'review-first' && ids.includes(target) && ready['reading-only'].has(target)) };
}

async function readDiveView(store: DailyFlowStore, stored: CycleStored, args: DailyFlowViewArgs,
  dive: NonNullable<DailyFlowViewArgs['dive']>, settings: DailyFlowSettings): Promise<DailyFlowView> {
  if (!store.readDiveMembers) throw new Error('daily_flow_dive_unavailable');
  const current = dive.stopped ? null : dive.currentNodeId;
  const members = dive.stopped ? [] : await store.readDiveMembers(dive.id);
  if (dive.phase === 'topics') {
    const { unread } = await readDiveUnreadRound(store, members, dive.memberIds ?? [], dive.position);
    const entries = current ? [current, ...unread] : unread;
    return { status: 'ready', scope: settings.scope ?? '', dayKey: stored.day_key, revision: stored.revision,
      now: args.now, mode: 'reading-only', currentNodeId: current,
      nodeIds: args.includeEntries ? entries : null, complete: args.includeEntries,
      modeAvailability: { recommended: false, 'review-first': false, 'reading-only': entries.length > 0 },
      nextChangeAt: nextFlowChangeAt(args.now, settings),
      canContinueReading: false };
  }
  const revisit = new Set(dive.revisitIds);
  const rows = members.length ? (await store.readRows(members)).filter(row => row.active &&
    row.order_key <= dive.limit && (row.order_key > dive.position || revisit.has(row.node_id)))
    .sort((a, b) => a.order_key - b.order_key) : [];
  // Due members come first and are not held to the segment's range.
  const due = members.length && store.timedRows
    ? (await store.timedRows(cycleScanFilter('recommended', args.now), members.length, members)).map(row => row.node_id) : [];
  const scopedIds = [...new Set([...due, ...rows.map(row => row.node_id)])];
  const snapshot = await store.scopedLearningSnapshot(scopedIds);
  const nodeOrder = [...new Set([...due,
    ...rows.filter(row => matchesDivePhase(dive, row, snapshot)).map(row => row.node_id)])];
  const scoped = { ...snapshot, nodeOrder };
  const mode = dive.mode;
  const ready = new Set(cycleReadyNodeIds(scoped, mode, args.now, settings));
  const available = (candidate: ReviewSessionMode) => cycleReadyNodeIds(scoped, candidate, args.now, settings).length > 0;
  const nodeIds = args.includeEntries ? [...new Set([...(current ? [current] : []), ...nodeOrder.filter(id => ready.has(id))])] : null;
  return { status: 'ready', scope: settings.scope ?? '', dayKey: stored.day_key, revision: stored.revision,
    now: args.now, mode, currentNodeId: current, nodeIds, complete: args.includeEntries,
    modeAvailability: { recommended: available('recommended'), 'review-first': available('review-first'),
      'reading-only': available('reading-only') }, nextChangeAt: nextFlowChangeAt(args.now, settings, snapshot, scopedIds),
    canContinueReading: false };
}
