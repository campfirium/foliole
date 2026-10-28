import type { ReviewSessionMode } from '../review/queue/reviewQueueTypes.js';
import type { DbPort } from '../sync/dbPort.js';

import { selectCycleSuccessor } from './cycleFlowSelection.js';
import type { DailyFlowSettings } from './dailyFlowContract.js';
import { dailyFlowSettingsForInstant } from './dailyFlowDayWindow.js';
import { flowDay } from './dailyFlowPlanning.js';
import type { DailyFlowPersistence } from './dailyFlowService.js';
import type { DailyFlowSession } from './dailyFlowSession.js';
import { createSqliteDailyFlowStore } from './dailyFlowSqliteStore.js';
import { readDailyFlow } from './dailyFlowStorage.js';

export type DailyFlowPredictionArgs = { now: string; token: NonNullable<DailyFlowSession['daily']>; currentNodeId: string };

// A readonly snapshot owns these facts; the copied cursor is never saved or used to advance Flow.
export async function predictDailyFlowDocument(db: DbPort, args: DailyFlowPredictionArgs,
  settings: DailyFlowSettings, persistence: DailyFlowPersistence) {
  settings = await dailyFlowSettingsForInstant(db, settings, args.now);
  const stored = await readDailyFlow(db);
  if (!stored || stored.invalidated || stored.settings_key !== JSON.stringify(settings)
    || args.token.scope !== (settings.scope ?? '') || stored.day_key !== args.token.dayKey
    || stored.day_key !== flowDay(args.now, settings) || stored.revision !== args.token.revision
    || stored.session.currentNodeId !== args.currentNodeId) return null;
  const next = await selectCycleSuccessor(createSqliteDailyFlowStore(db, persistence), { ...stored.session.cycle! }, {
    mode: stored.mode as ReviewSessionMode, now: args.now, settings, excluded: args.currentNodeId });
  return next?.node_id ?? null;
}
