import type { ReviewSessionMode } from '../review/queue/reviewQueueTypes.js';
import type { DbPort } from '../sync/dbPort.js';

import { cycleReadyNodeIds } from './cycleFlowSelection.js';
import type { DailyFlowSettings } from './dailyFlowContract.js';
import { flowDay } from './dailyFlowPlanning.js';
import type { DailyFlowPersistence } from './dailyFlowService.js';
import { createSqliteDailyFlowStore } from './dailyFlowSqliteStore.js';
import type { DailyFlowStore } from './dailyFlowStore.js';
import type { DailyFlowViewArgs, DailyFlowViewResult } from './dailyFlowViewContract.js';

export function readDailyFlowView(db: DbPort, args: DailyFlowViewArgs, settings: DailyFlowSettings,
  persistence: DailyFlowPersistence): Promise<DailyFlowViewResult> {
  return db.transaction(tx => readStoredDailyFlowView(createSqliteDailyFlowStore(tx, persistence), args, settings));
}

export async function readStoredDailyFlowView(store: DailyFlowStore, args: DailyFlowViewArgs, settings: DailyFlowSettings): Promise<DailyFlowViewResult> {
    const stored = await store.readState();
    if (!stored || stored.invalidated || stored.day_key !== flowDay(args.now, settings) ||
      stored.settings_key !== JSON.stringify(settings)) return { status: 'needs-preparation' };
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
    const ordered = args.includeEntries ? [...new Set([
      ...(currentNodeId ? [currentNodeId] : []),
      ...rows.filter(row => row.order_key > meta.scanAfter && row.order_key <= meta.lapLimit).map(row => row.node_id),
      ...rows.filter(row => row.order_key <= meta.tailKey).map(row => row.node_id)
    ])].filter(id => ready[args.mode].has(id)) : null;
    const target = args.continueNodeId;
    return { status: 'ready', scope: settings.scope ?? '', dayKey: stored.day_key, revision: stored.revision,
      now: args.now, mode: args.mode, currentNodeId, nodeIds: ordered, complete: args.includeEntries,
      modeAvailability: { recommended: available('recommended'), 'review-first': available('review-first'),
        'reading-only': available('reading-only') },
      canContinueReading: Boolean(!stored.session.currentNodeId && target && target === stored.session.continueNodeId &&
        (stored.session.reviewedItemCount ?? 0) > 0 && args.mode !== 'review-first' && ids.includes(target) && ready['reading-only'].has(target)) };
}
