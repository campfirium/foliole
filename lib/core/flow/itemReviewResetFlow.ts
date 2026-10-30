import type { DbPort } from '../sync/dbPort.js';

import { allocateCycleKey } from './cycleFlowState.js';
import type { DailyFlowSettings } from './dailyFlowContract.js';
import { refreshDailyFlowAfterSync } from './dailyFlowRefresh.js';
import { openDailyFlow, type DailyFlowPersistence } from './dailyFlowService.js';
import { readCycleRows, readDailyFlow, saveCycleFlow, writeCycleRows } from './dailyFlowStorage.js';

/** Restart review work without discarding reading facts, review history or daily statistics. */
export async function restartDailyFlowItemReviews(db: DbPort, nodeIds: readonly string[], now: string,
  settings: DailyFlowSettings, persistence: DailyFlowPersistence) {
  await refreshDailyFlowAfterSync(db, now, settings, persistence);
  const stored = await readDailyFlow(db);
  if (stored && nodeIds.length) {
    const cycle = { ...stored.session.cycle! };
    const rows = await readCycleRows(db, nodeIds);
    await writeCycleRows(db, rows.map(row => ({ ...row, active: 1, handled: 0, initial_task: 1,
      cohort: 'queue', order_key: allocateCycleKey(cycle) })));
    await saveCycleFlow(db, { dayKey: stored.day_key, mode: 'review-first', settingsKey: stored.settings_key,
      now, revision: stored.revision + 1, session: { ...stored.session,
        currentNodeId: null, queueNodeIds: [], isAnswerRevealed: false, completedAt: null,
        continueNodeId: null, cycle: { ...cycle, clearKey: cycle.tailKey, scanAfter: 0,
          lapLimit: cycle.tailKey, clearedAt: null } } });
    await db.run('UPDATE daily_flow_state SET invalidated=1 WHERE id=1');
  }
  return openDailyFlow(db, { now, mode: 'review-first' }, settings, persistence);
}
