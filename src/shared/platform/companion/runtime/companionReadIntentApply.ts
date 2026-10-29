import type { DailyFlowResult } from '../../../../../lib/core/flow/dailyFlowContract';
import { commitDailyFlow } from '../../../../../lib/core/flow/dailyFlowService';
import { readDailyFlow } from '../../../../../lib/core/flow/dailyFlowStorage';
import type { CycleStored, PreparedFlowNavigation } from '../../../../../lib/core/flow/dailyFlowStore';
import type { ReadIntentJournal, ReadIntentRow } from '../../../../../lib/core/flow/readIntentJournal';
import type { DbPort } from '../../../../../lib/core/sync/dbPort';

import { companionDailyFlowPersistence } from './companionDailyFlow';
import { appendCompanionFlowHistory } from './companionFlowHistoryStore';
import { assertReadIntentLibrary, isReadIntentApplied, prepareReadIntentCommand } from './companionReadIntentCommand';
import { companionReadPersistence } from './companionReadPersistence';

type Outcome = { state: 'applied' | 'superseded'; result: DailyFlowResult | null };

export async function applyReadIntent(db: DbPort, journal: ReadIntentJournal, input: string | ReadIntentRow, navigation?: PreparedFlowNavigation): Promise<Outcome> {
  const saved = typeof input === 'string' ? (await journal.rows()).find(value => value.intent.id === input) : input;
  if (!saved) throw new Error('read_intent_missing');
  if (saved.intent.admittedCommand && saved.command) return db.transaction(async tx => {
    await assertReadIntentLibrary(tx, saved.intent.libraryId);
    if (await isReadIntentApplied(tx, saved)) return currentOutcome(tx, 'applied');
    const stored = await readDailyFlow(tx);
    if (!stored || stored.day_key !== saved.intent.dayKey || stored.mode !== saved.intent.mode ||
      stored.session.currentNodeId !== saved.intent.nodeId) return currentOutcome(tx, 'superseded');
    const command = { ...saved.command!, token: stored.session.daily!, sourceSession: stored.session };
    return commitRead(tx, saved.intent, command, saved.entry!, navigation, stored);
  });
  const prepared = await db.transaction(async tx => {
    await assertReadIntentLibrary(tx, saved.intent.libraryId);
    if (await isReadIntentApplied(tx, saved)) return { confirmed: true as const };
    if (saved.command) return { command: saved.command, entry: saved.entry! };
    const value = await prepareReadIntentCommand(tx, saved.intent);
    return value ? { command: value.command, entry: JSON.stringify(value.entry) } : null;
  });
  if (!prepared || 'confirmed' in prepared) {
    const current = await readDailyFlow(db);
    return { state: prepared ? 'applied' : 'superseded', result: current ? {
      session: current.session, mode: current.mode as NonNullable<DailyFlowResult['mode']>, replayed: true } : null };
  }
  // Preparation may reconcile peer facts. Its cursor must commit before the immutable command
  // reaches the independent journal, so a crash cannot retain a token for rolled-back state.
  if (!saved.command) await journal.prepare(saved.intent.id, prepared.command, prepared.entry);
  return db.transaction(tx => commitRead(tx, saved.intent, prepared.command, prepared.entry));
}

async function currentOutcome(db: DbPort, state: Outcome['state']): Promise<Outcome> {
  const current = await readDailyFlow(db);
  return { state, result: current ? { session: current.session,
    mode: current.mode as NonNullable<DailyFlowResult['mode']>, replayed: true } : null };
}

async function commitRead(tx: DbPort, intent: import('../../../../../lib/core/flow/readIntentJournal').ReadIntent,
  command: import('../../../../../lib/core/flow/dailyFlowContract').DailyFlowCommitArgs, entry: string, navigation?: PreparedFlowNavigation, stored?: CycleStored): Promise<Outcome> {
  const result = await commitDailyFlow(tx, command, intent.settings, intent.admittedCommand ? companionReadPersistence() : companionDailyFlowPersistence, navigation, stored);
  const original = JSON.parse(entry);
  await appendCompanionFlowHistory(tx, intent.historyKey, { ...original,
    beforeContext: { ...original.beforeContext, reviewSession: result.sourceSession ?? command.sourceSession },
    afterContext: { ...original.afterContext, activeNodeId: result.session.currentNodeId, reviewSession: result.session } });
  return { state: 'applied', result: { ...result, mode: intent.mode } };
}
