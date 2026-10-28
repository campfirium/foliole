import type { Peer } from '../../electron/database/syncLibrary.testSupport';
import { dailyFlowHistoryCommand } from '../../lib/core/flow/dailyFlowHistory';
import { commitDailyFlow, openDailyFlow } from '../../lib/core/flow/dailyFlowService';
import type { DailyFlowSession } from '../../lib/core/flow/dailyFlowSession';

import { act, now, persistence, settings, snapshot } from './dailyFlowExceptions.testSupport';

export async function historyEntry(peer: Peer, id: string, action: 'grade' | 'read' | 'soon', stamp: string) {
  const source = (await openDailyFlow(peer.port, { now, mode: 'recommended', preferredNodeId: id }, settings(peer), persistence)).session;
  const before = (await snapshot(peer)).nodesById[id]!;
  const after = await act(peer, source, action, stamp);
  const next = (await snapshot(peer)).nodesById[id]!;
  const head = peer.db.prepare('SELECT head_id FROM daily_flow_sync_projection').get() as { head_id: string };
  const common = { id: head.head_id, nodeId: id, beforeContext: { reviewSession: source }, afterContext: { reviewSession: after } };
  return action === 'grade' ? { ...common, type: 'review.grade' as const, beforeReview: before.review, afterReview: next.review }
    : { ...common, type: 'topic.dismiss' as const, beforeReading: before.reading, afterReading: next.reading };
}

export async function replayHistory(peer: Peer, session: DailyFlowSession, entry: Awaited<ReturnType<typeof historyEntry>>,
  mode: 'undo' | 'redo', stamp: string) {
  return commitDailyFlow(peer.port, dailyFlowHistoryCommand({ session, entry, mode, now: stamp }), settings(peer), persistence);
}
