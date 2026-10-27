import type { DailyFlowSession } from '../../lib/core/flow/dailyFlowSession';
import { readDailyFlow, saveCycleFlow } from '../../lib/core/flow/dailyFlowStorage';
import type { DbPort } from '../../lib/core/sync/dbPort';

// Exercise the retained explicit command with a completion cursor from the old UI.
// Synthetic compatibility fixture only; never evidence for normal cycle acceptance.
// Newly completed cycles now cross this point automatically.
export async function legacyContinuation(db: DbPort, session: DailyFlowSession, now: string) {
  const state = await readDailyFlow(db);
  if (!state || !session.currentNodeId) throw new Error('test_continuation_missing');
  return db.transaction(tx => saveCycleFlow(tx, { dayKey: state.day_key, settingsKey: state.settings_key,
    mode: state.mode, now, revision: state.revision + 1,
    session: { ...session, currentNodeId: null, continueNodeId: session.currentNodeId,
      queueNodeIds: [], completedAt: now } }));
}
