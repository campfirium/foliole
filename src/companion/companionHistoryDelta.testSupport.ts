import type { ReviewSessionMode } from '../features/review/model/reviewSessionMode';
import { openCompanionDailyFlow } from '../shared/platform/companion/runtime/companionDailyFlow';
import { commitCompanionFlowHistory, loadCompanionFlowHistory, replayCompanionFlowHistory } from '../shared/platform/companion/runtime/companionFlowHistory';
import { companionFlowHistoryKey } from '../shared/platform/companion/runtime/companionFlowHistoryStore';
import { createSearchLibrary, reopenSearchLibrary } from '../shared/platform/companion/runtime/companionSearchSnapshot.testSupport';
import { loadCompanionWorkspaceSyncState } from '../shared/platform/companionWorkspaceSync';
import { createEmptyReviewSession } from '../store/workspaceReviewReading';

import { seedCompanionReviewHistory } from './companionFlowHistory.testSupport';
import { createCompanionFlowHistoryEntry } from './companionFlowHistoryEntry';
import { persistFlowMutation } from './companionFlowMutation';

export const historyNow = '2026-10-26T08:00:00.000Z';
export const historyKey = companionFlowHistoryKey('Search');
export async function createHistoryDeltaFixture(topics = true, extraNodeIds: string[] = []) {
  const library = await createSearchLibrary(0);
  let db = library.database;
  let connection = library.connection;
  const snapshot = async () => (await loadCompanionWorkspaceSyncState()).workspace_snapshot!;
  await seedCompanionReviewHistory({ due: '2026-10-01T00:00:00.000Z', lastReviewAt: '2026-09-28T00:00:00.000Z',
    state: 2, stability: 3, difficulty: 4, elapsedDays: 3, scheduledDays: 3, reps: 2, lapses: 0 }, historyNow, ['a', 'b', 'c', ...extraNodeIds], topics ? 'topic' : 'item');
  const fixture = { library, snapshot, mode: (topics ? 'recommended' : 'review-first') as ReviewSessionMode,
    session: createEmptyReviewSession(), get db() { return db; }, get connection() { return connection; },
    history: () => loadCompanionFlowHistory(historyKey),
    async open(now = historyNow, preferredNodeId?: string) {
      fixture.session = (await openCompanionDailyFlow({ now, mode: fixture.mode,
        ...(preferredNodeId ? { preferredNodeId } : {}) })).session;
      return fixture.session;
    },
    async action(action: 'soon' | 'grade' | 'read' | 'later' | 'dismiss', now = historyNow) {
      const before = await snapshot();
      const history = { key: historyKey, mode: fixture.mode, session: fixture.session };
      const nodeId = fixture.session.currentNodeId!;
      if (action === 'soon') {
        const result = await commitCompanionFlowHistory({ key: historyKey, mode: fixture.mode,
          entry: createCompanionFlowHistoryEntry({ action, nodeId, now, before, after: before, history }) });
        if (typeof result !== 'object' || !('session' in result)) throw new Error('missing_session');
        fixture.session = result.session;
      } else {
        const result = await persistFlowMutation({ action, ...(action === 'grade' ? { grade: 3 as const } : {}),
          nodeId, now, snapshot: before, history });
        fixture.session = result.session!;
      }
      return fixture.session;
    },
    async replay(mode: 'undo' | 'redo', requestId?: string) {
      fixture.session = (await replayCompanionFlowHistory(historyKey, mode, fixture.session, requestId))!;
      return fixture.session;
    },
    async reopen() {
      const reopened = await reopenSearchLibrary(library.root, historyNow);
      db = reopened.db;
      connection = reopened.connection;
    }
  };
  return fixture;
}
