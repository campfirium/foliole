import type { SchedulerCard } from '../review/types.js';
import type { DbPort } from '../sync/dbPort.js';

import { commitCycleFlow } from './cycleFlowCommit.js';
import { openCycleFlow } from './cycleFlowOpen.js';
import type { DailyFlowCommitArgs, DailyFlowOpenArgs, DailyFlowResult, DailyFlowSettings, DailyFlowSnapshot, DailyFlowLearningSnapshot } from './dailyFlowContract.js';
import { dailyFlowSettingsForInstant, differsFromStoredFlowWindow } from './dailyFlowDayWindow.js';
import { applyLocalDailyFlowOperations } from './dailyFlowLocalApplication.js';
import { flowDay } from './dailyFlowPlanning.js';
import { readCurrentFlowLearning } from './dailyFlowReceipt.js';
import type { DailyFlowSession } from './dailyFlowSession.js';
import { createSqliteDailyFlowStore } from './dailyFlowSqliteStore.js';
import { readDailyFlow, saveCycleFlow } from './dailyFlowStorage.js';
import type { CycleStored, PreparedFlowNavigation } from './dailyFlowStore.js';
import { recordDailyFlowSync } from './dailyFlowSyncRecord.js';
import { commitTargetedFlowHistory } from './dailyFlowTargetHistory.js';
import { transactionDailyFlowPersistence } from './dailyFlowTransactionFacts.js';
import { openDiveCurrent } from './diveCycleFlow.js';
import { timeFlow, type FlowTiming } from './flowTiming.js';

export interface DailyFlowPersistence {
  readingPreservesPosition?: boolean;
  learningSnapshot(db: DbPort, nodeIds?: readonly string[]): Promise<DailyFlowLearningSnapshot>;
  snapshot(db: DbPort, nodeIds?: readonly string[]): Promise<DailyFlowSnapshot>;
  grade(db: DbPort, args: NonNullable<DailyFlowCommitArgs['grade']>, opId: string): Promise<SchedulerCard | null>;
  reading(db: DbPort, value: NonNullable<DailyFlowCommitArgs['readings']>[number], now: string): Promise<void>;
  reviewHistory(db: DbPort, value: NonNullable<DailyFlowCommitArgs['reviewHistory']>, now: string): Promise<SchedulerCard | null>;
}

export function openDailyFlow(db: DbPort, args: DailyFlowOpenArgs, settings: DailyFlowSettings,
  persistence: DailyFlowPersistence, timing?: FlowTiming): Promise<DailyFlowResult> {
  return db.transaction(async tx => {
    const previous = await readDailyFlow(tx);
    await applyLocalDailyFlowOperations(tx, args.now);
    const config = await dailyFlowSettingsForInstant(tx, settings, args.now);
    if (args.dive) {
      const stored = await readDailyFlow(tx);
      const global = stored?.day_key === flowDay(args.now, config) && !differsFromStoredFlowWindow(stored, config) ? stored.session
        : (await openGlobalDailyFlow(tx, { now: args.now, mode: 'recommended', prepareOnly: true },
          config, persistence, previous, timing)).session;
      const store = createSqliteDailyFlowStore(tx, persistence);
      const session = await timeFlow(timing, 'dive-choose-next', () => openDiveCurrent(store, global, args, config));
      return { mode: args.mode, session, learning: await readCurrentFlowLearning(store, session.currentNodeId) };
    }
    return openGlobalDailyFlow(tx, args, config, persistence, previous, timing);
  });
}

async function openGlobalDailyFlow(tx: DbPort, args: DailyFlowOpenArgs, config: DailyFlowSettings,
  persistence: DailyFlowPersistence, previous: CycleStored | null, timing?: FlowTiming) {
  let result = await openCycleFlow(tx, args, config, persistence, false, undefined, timing);
  await recordDailyFlowSync(tx, result, config, args.now);
  if (await applyLocalDailyFlowOperations(tx, args.now)) {
    if (previous?.day_key !== result.session.daily!.dayKey || differsFromStoredFlowWindow(previous, config)) {
      const stored = (await readDailyFlow(tx))!;
      await saveCycleFlow(tx, { dayKey: stored.day_key, mode: stored.mode, settingsKey: stored.settings_key,
        now: args.now, revision: stored.revision, session: { ...stored.session, currentNodeId: null,
          cycle: { ...stored.session.cycle!, scanAfter: 0 } } });
      // The rewind only changes the cursor. The replayed rows still need reconciliation.
      await tx.run('UPDATE daily_flow_state SET invalidated=1 WHERE id=1');
    }
    result = await openCycleFlow(tx, args, config, persistence, false, undefined, timing);
  }
  return result;
}

export function commitDailyFlow(db: DbPort, args: DailyFlowCommitArgs, settings: DailyFlowSettings,
  persistence: DailyFlowPersistence, preparedNavigation?: PreparedFlowNavigation, current?: CycleStored, timing?: FlowTiming): Promise<DailyFlowResult> {
  return db.transaction(async tx => {
    const stored = current ?? await readDailyFlow(tx);
    const config = await dailyFlowSettingsForInstant(tx, settings, args.now, Boolean(args.historyMode), stored);
    const changed = await applyLocalDailyFlowOperations(tx, args.now, stored);
    const targeted = await commitTargetedFlowHistory(tx, args, config, persistence);
    if (targeted) return targeted;
    const store = createSqliteDailyFlowStore(tx, transactionDailyFlowPersistence(persistence));
    if (timing) store.timing = timing;
    store.preparedNavigation = !changed && stored && !stored.invalidated && stored.settings_key === JSON.stringify(config)
      ? preparedNavigation : undefined;
    if (!changed) store.readState = async () => stored;
    const result: DailyFlowResult = await commitCycleFlow(store, args, config);
    // Sync records learning and shared row changes from the durable global state.
    const syncResult = result.session.dive && !result.replayed
      ? { ...result, mode: stored!.mode as DailyFlowOpenArgs['mode'], session: (await readDailyFlow(tx))!.session } : result;
    await recordDailyFlowSync(tx, syncResult, config, args.now, args);
    return result;
  });
}

export function withoutDailyToken(session: DailyFlowSession): DailyFlowSession {
  const result = { ...session };
  delete result.daily;
  return result;
}
