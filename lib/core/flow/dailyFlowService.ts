import type { SchedulerCard } from '../review/types.js';
import type { DbPort } from '../sync/dbPort.js';

import { commitCycleFlow } from './cycleFlowCommit.js';
import { openCycleFlow } from './cycleFlowOpen.js';
import type { DailyFlowCommitArgs, DailyFlowOpenArgs, DailyFlowResult, DailyFlowSettings, DailyFlowSnapshot, DailyFlowLearningSnapshot } from './dailyFlowContract.js';
import { dailyFlowSettingsForInstant } from './dailyFlowDayWindow.js';
import { applyLocalDailyFlowOperations } from './dailyFlowLocalApplication.js';
import type { DailyFlowSession } from './dailyFlowSession.js';
import { createSqliteDailyFlowStore } from './dailyFlowSqliteStore.js';
import { readDailyFlow, saveCycleFlow } from './dailyFlowStorage.js';
import { recordDailyFlowSync } from './dailyFlowSyncRecord.js';
import { commitTargetedFlowHistory } from './dailyFlowTargetHistory.js';
import { transactionDailyFlowPersistence } from './dailyFlowTransactionFacts.js';

export interface DailyFlowPersistence {
  learningSnapshot(db: DbPort, nodeIds?: readonly string[]): Promise<DailyFlowLearningSnapshot>;
  snapshot(db: DbPort, nodeIds?: readonly string[]): Promise<DailyFlowSnapshot>;
  grade(db: DbPort, args: NonNullable<DailyFlowCommitArgs['grade']>, opId: string): Promise<SchedulerCard | null>;
  reading(db: DbPort, value: NonNullable<DailyFlowCommitArgs['readings']>[number], now: string): Promise<void>;
  reviewHistory(db: DbPort, value: NonNullable<DailyFlowCommitArgs['reviewHistory']>, now: string): Promise<SchedulerCard | null>;
}

export function openDailyFlow(db: DbPort, args: DailyFlowOpenArgs, settings: DailyFlowSettings,
  persistence: DailyFlowPersistence): Promise<DailyFlowResult> {
  return db.transaction(async tx => {
    const previous = await readDailyFlow(tx);
    await applyLocalDailyFlowOperations(tx, args.now);
    const config = await dailyFlowSettingsForInstant(tx, settings, args.now);
    let result = await openCycleFlow(tx, args, config, persistence);
    await recordDailyFlowSync(tx, result, config, args.now);
    if (await applyLocalDailyFlowOperations(tx, args.now)) {
      if (previous?.day_key !== result.session.daily!.dayKey) {
        const stored = (await readDailyFlow(tx))!;
        await saveCycleFlow(tx, { dayKey: stored.day_key, mode: stored.mode, settingsKey: stored.settings_key,
          now: args.now, revision: stored.revision, session: { ...stored.session, currentNodeId: null,
            cycle: { ...stored.session.cycle!, scanAfter: 0 } } });
      }
      result = await openCycleFlow(tx, args, config, persistence);
    }
    return result;
  });
}

export function commitDailyFlow(db: DbPort, args: DailyFlowCommitArgs, settings: DailyFlowSettings,
  persistence: DailyFlowPersistence): Promise<DailyFlowResult> {
  return db.transaction(async tx => {
    const config = await dailyFlowSettingsForInstant(tx, settings, args.now, Boolean(args.historyMode));
    await applyLocalDailyFlowOperations(tx, args.now);
    const targeted = await commitTargetedFlowHistory(tx, args, config, persistence);
    if (targeted) return targeted;
    const result = await commitCycleFlow(createSqliteDailyFlowStore(tx, transactionDailyFlowPersistence(persistence)), args, config);
    await recordDailyFlowSync(tx, result, config, args.now, args);
    return result;
  });
}

export function withoutDailyToken(session: DailyFlowSession): DailyFlowSession {
  const result = { ...session };
  delete result.daily;
  return result;
}
