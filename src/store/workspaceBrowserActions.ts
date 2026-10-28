import { createAwaitedWorkspaceHistoryActions } from './workspaceActionHistory';
import { createBrowserWorkspaceCandidate, type BrowserWorkspaceCandidate } from './workspaceBrowserCandidate';
import { browserLocalWorkspaceReviewPersistence } from './workspaceReviewPersistence';
import { createSetFolderManualChildOrderAction } from './workspaceStoreManualChildOrderActions';
import { createWorkspaceReviewActions } from './workspaceStoreReviewActions';
import { createSetNodeSequentialReadingAction } from './workspaceStoreSequentialReadingActions';
import type { WorkspaceState } from './workspaceStoreTypes';

type Store = { getState(): WorkspaceState; setState(patch: Partial<WorkspaceState> | ((state: WorkspaceState) => Partial<WorkspaceState>)): void };
const candidates = new Set<BrowserWorkspaceCandidate>();
export async function browserWorkspaceTransaction<T>(store: Store, nodes: Record<string, unknown>,
  action: (candidate: BrowserWorkspaceCandidate) => Promise<T>): Promise<T> {
  const active = [...candidates].find(candidate => candidate.get().nodesById === nodes);
  if (active) return action(active);
  const candidate = createBrowserWorkspaceCandidate(store.getState, store.setState);
  const result = await action(candidate);
  candidate.publish();
  return result;
}

function candidateActions(candidate: BrowserWorkspaceCandidate) {
  return {
    ...createWorkspaceReviewActions(candidate.set, candidate.get, undefined, browserLocalWorkspaceReviewPersistence),
    ...createAwaitedWorkspaceHistoryActions(candidate.set, candidate.get),
    setFolderManualChildOrder: createSetFolderManualChildOrderAction(candidate.set, candidate.get),
    setNodeSequentialReading: createSetNodeSequentialReadingAction(candidate.set, candidate.get)
  };
}

export function createBrowserWorkspaceActions(store: Store): Partial<WorkspaceState> {
  const keys = Object.keys(candidateActions(createBrowserWorkspaceCandidate(store.getState, store.setState)));
  return Object.fromEntries(keys.filter(key => key !== 'revealReviewAnswer' && key !== 'exitReviewSession')
    .map(key => [key, async (...args: unknown[]) => {
      const candidate = createBrowserWorkspaceCandidate(store.getState, store.setState);
      candidates.add(candidate);
      try {
        const actions = candidateActions(candidate);
        const action = actions[key as keyof typeof actions] as (...values: unknown[]) => unknown;
        const result = await action(...args);
        if (result !== false || ['startReviewSession', 'resumeReviewSession', 'continueReviewSessionReading'].includes(key)) candidate.publish();
        return result;
      } catch (error) {
        console.error('Could not save the browser workspace.', error);
        return false;
      } finally { candidates.delete(candidate); }
    }]));
}
