import type { SchedulerCard } from '../review/types.js';
import type { DbPort } from '../sync/dbPort.js';

import { commitCycleFlow } from './cycleFlowCommit.js';
import { openCycleFlow } from './cycleFlowOpen.js';
import type { DailyFlowCommitArgs, DailyFlowOpenArgs, DailyFlowResult, DailyFlowSettings, DailyFlowSnapshot } from './dailyFlowContract.js';
import type { DailyFlowSession } from './dailyFlowSession.js';
import { transactionDailyFlowPersistence } from './dailyFlowTransactionFacts.js';

export interface DailyFlowPersistence {
  snapshot(db: DbPort, nodeIds?: readonly string[]): Promise<DailyFlowSnapshot>;
  grade(db: DbPort, args: NonNullable<DailyFlowCommitArgs['grade']>, opId: string): Promise<SchedulerCard | null>;
  reading(db: DbPort, value: NonNullable<DailyFlowCommitArgs['readings']>[number], now: string): Promise<void>;
  reviewHistory(db: DbPort, value: NonNullable<DailyFlowCommitArgs['reviewHistory']>, now: string): Promise<SchedulerCard | null>;
}

export function openDailyFlow(db: DbPort, args: DailyFlowOpenArgs, settings: DailyFlowSettings,
  persistence: DailyFlowPersistence): Promise<DailyFlowResult> {
  return db.transaction(tx => openCycleFlow(tx, args, settings, persistence));
}

export function commitDailyFlow(db: DbPort, args: DailyFlowCommitArgs, settings: DailyFlowSettings,
  persistence: DailyFlowPersistence): Promise<DailyFlowResult> {
  return db.transaction(tx => commitCycleFlow(tx, args, settings, transactionDailyFlowPersistence(persistence)));
}

export function withoutDailyToken(session: DailyFlowSession): DailyFlowSession {
  const result = { ...session };
  delete result.daily;
  return result;
}
