import { hashTextBody } from '../../lib/core/database/textBodyHash';
import { getCurrentReviewSchedulerSettings } from '../features/settings/model/reviewSchedulerSettings';
import { createBrowserDailyFlowRuntime } from '../shared/platform/runtime/browserDailyFlowRuntime';
import { emptyBrowserDailyFlow } from '../shared/platform/runtime/browserDailyFlowState';
import { captureBrowserReviewBases } from '../shared/platform/runtime/browserReviewProjection';
import { installBrowserDailyFlowRuntime } from '../shared/platform/runtime/dailyFlowBrowserRuntime';

import { browserWorkspaceTransaction, createBrowserWorkspaceActions } from './workspaceBrowserActions';
import { installWorkspaceBrowserCommit } from './workspaceBrowserCommit';
import { BROWSER_WORKSPACE_VERSION, readBrowserWorkspaceEnvelope } from './workspaceBrowserEnvelope';
import { partializeWorkspaceState } from './workspaceStorePersistConfig';
import type { WorkspacePersistedState, WorkspaceState } from './workspaceStoreTypes';

type Store = { getState(): WorkspaceState; setState(patch: Partial<WorkspaceState>): void };
const KEY = 'foliole-workspace-v1';

export function installBrowserWorkspace(store: Store, storage: Storage, initial?: WorkspacePersistedState,
  transform: (state: WorkspacePersistedState) => WorkspacePersistedState = state => state) {
  const raw = storage.getItem(KEY);
  const envelope = raw ? readBrowserWorkspaceEnvelope(raw) : initial ? { state: initial, version: BROWSER_WORKSPACE_VERSION } : null;
  if (!envelope) throw new Error('browser_workspace_missing');
  replaceBrowserWorkspace(store, storage, transform(envelope.state));
}

export function replaceBrowserWorkspace(store: Store, storage: Storage, incoming: WorkspacePersistedState & Partial<WorkspaceState>) {
  let expectedHash = hashTextBody(storage.getItem(KEY) ?? '');
  const save = (state: WorkspaceState) => {
    const raw = JSON.stringify({ version: BROWSER_WORKSPACE_VERSION,
      state: { ...partializeWorkspaceState(state), reviewSession: state.reviewSession, browserDailyFlow: state.browserDailyFlow,
        appActionHistory: state.appActionHistory } });
    const currentHash = hashTextBody(storage.getItem(KEY) ?? '');
    if (currentHash !== expectedHash) throw new Error('browser_workspace_changed');
    const nextHash = hashTextBody(raw);
    if (nextHash === currentHash) return;
    storage.setItem(KEY, raw);
    expectedHash = nextHash;
  };
  installBrowserDailyFlowRuntime(null);
  installWorkspaceBrowserCommit({ save });
  store.setState({ ...incoming, browserDailyFlow: captureBrowserReviewBases(incoming.browserDailyFlow ?? emptyBrowserDailyFlow(), incoming.nodesById), libraryScope: 'browser-workspace', isHydrated: true, workspaceHydrationError: null });
  installBrowserDailyFlowRuntime(createBrowserDailyFlowRuntime({
    transaction: (nodes, action) => browserWorkspaceTransaction(store, nodes, action),
    settings: () => {
      const settings = getCurrentReviewSchedulerSettings();
      return { scope: 'browser-workspace', newDayStartsAtHour: settings.newDayStartsAtHour, pushQueue: settings.pushQueue };
    }
  }));
  store.setState(createBrowserWorkspaceActions(store));
}
