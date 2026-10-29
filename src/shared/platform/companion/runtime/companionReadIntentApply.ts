import type { DailyFlowResult } from '../../../../../lib/core/flow/dailyFlowContract';
import { commitDailyFlow } from '../../../../../lib/core/flow/dailyFlowService';
import { readDailyFlow } from '../../../../../lib/core/flow/dailyFlowStorage';
import type { ReadIntentJournal } from '../../../../../lib/core/flow/readIntentJournal';
import type { DbPort } from '../../../../../lib/core/sync/dbPort';

import { companionDailyFlowPersistence } from './companionDailyFlow';
import { appendCompanionFlowHistory } from './companionFlowHistoryStore';
import { assertReadIntentLibrary, isReadIntentApplied, prepareReadIntentCommand } from './companionReadIntentCommand';

type Outcome = { state: 'applied' | 'superseded'; result: DailyFlowResult | null };

export async function applyReadIntent(db: DbPort, journal: ReadIntentJournal, id: string): Promise<Outcome> {
  const saved = (await journal.rows()).find(value => value.intent.id === id);
  if (!saved) throw new Error('read_intent_missing');
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
  if (!saved.command) await journal.prepare(id, prepared.command, prepared.entry);
  return db.transaction(async tx => {
    const result = await commitDailyFlow(tx, prepared.command, saved.intent.settings, companionDailyFlowPersistence);
    const original = JSON.parse(prepared.entry);
    await appendCompanionFlowHistory(tx, saved.intent.historyKey, { ...original,
      beforeContext: { ...original.beforeContext, reviewSession: result.sourceSession ?? prepared.command.sourceSession },
      afterContext: { ...original.afterContext, activeNodeId: result.session.currentNodeId, reviewSession: result.session } });
    return { state: 'applied', result: { ...result, mode: saved.intent.mode } };
  });
}
