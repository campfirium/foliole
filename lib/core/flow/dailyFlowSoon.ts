import type { DbPort } from '../sync/dbPort.js';

import type { DailyFlowCommitArgs, DailyFlowSettings } from './dailyFlowContract.js';
import { hasReadyDailyReview } from './dailyFlowGrade.js';
import type { DailyFlowPersistence } from './dailyFlowService.js';
import type { readDailyFlow } from './dailyFlowStorage.js';

export async function dailySoonScope(db: DbPort, stored: NonNullable<Awaited<ReturnType<typeof readDailyFlow>>>,
  args: DailyFlowCommitArgs, settings: DailyFlowSettings, persistence: DailyFlowPersistence) {
  if (!args.nextSession || args.grade || args.reviewHistory || args.readingAction || args.historyMode ||
    stored.invalidated || stored.settings_key !== JSON.stringify(settings) ||
    (args.readings ?? []).some(value => JSON.stringify(value.before) !== JSON.stringify(value.after))) return null;
  if (stored.mode !== 'reading-only' && await hasReadyDailyReview(db, args.now, settings, persistence)) return null;
  return [...new Set([stored.session.currentNodeId, args.nextSession.currentNodeId,
    ...(args.readings ?? []).map(value => value.nodeId)].filter((id): id is string => Boolean(id)))];
}
