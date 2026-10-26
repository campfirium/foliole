import { readDailyFlow } from '../../../../../lib/core/flow/dailyFlowStorage';
import { restoreFlowHistoryEntry } from '../../../../../lib/core/flow/flowHistoryEntry';
import type { DbPort } from '../../../../../lib/core/sync/dbPort';
import type { ReviewSessionState } from '../../../../store/workspaceStoreTypes';

import type { readCompanionFlowHistory } from './companionFlowHistoryStore';

export async function readCompanionHistoryReplayReceipt(db: DbPort,
  history: Awaited<ReturnType<typeof readCompanionFlowHistory>>, requestId: string, session: ReviewSessionState) {
  const receipt = history.replayReceipt;
  if (receipt?.id !== requestId) return null;
  if (receipt.daily) {
    const state = await readDailyFlow(db);
    if (!state || state.invalidated || JSON.stringify(state.session.daily) !== JSON.stringify(receipt.daily)) {
      throw new Error('daily_flow_ack_superseded');
    }
    return state.session;
  }
  const top = (receipt.mode === 'undo' ? history.redoStack : history.undoStack).at(-1);
  if (!top) throw new Error('flow_history_changed');
  const entry = restoreFlowHistoryEntry(top, session);
  if (entry.type === 'nodes.change') return (receipt.mode === 'undo' ? entry.beforeSession : entry.afterSession) ?? session;
  return (receipt.mode === 'undo' ? entry.beforeContext : entry.afterContext).reviewSession;
}
