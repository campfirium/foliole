import { useState } from 'react';
import { vi } from 'vitest';

import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import type { CompanionReadableArticle } from '../shared/platform/companionReadableArticle';

import { createWorkspaceSnapshotActions } from './companionWorkspaceSyncActions';
import { useCompanionArticleSurface } from './useCompanionArticleSurface';
import { createFloatingBar, createWorkspaceSync } from './useCompanionArticleSurfaceTestSupport';
import { useCompanionReadableArticleLoader } from './useCompanionReadableArticleLoader';
import { useCompanionWorkspaceState } from './useCompanionWorkspaceState';

export function useDailyFlowSurface(initial: WorkspaceSnapshot) {
  const [state, setState] = useCompanionWorkspaceState(createWorkspaceSync(initial).state);
  const [readableArticle, publish] = useState<CompanionReadableArticle | null>(null);
  const snapshot = state.workspace_snapshot!;
  const loader = useCompanionReadableArticleLoader(snapshot, publish);
  const actions = createWorkspaceSnapshotActions({ state, setState, setError: () => {},
    setSyncConflictCount: () => {}, setSyncProgress: () => {}, setStatus: () => {} });
  const workspace = { ...createWorkspaceSync(snapshot), state, readableArticle,
    refreshAfterMutation: vi.fn(actions.refreshAfterMutation), openReadableArticle: loader.openReadableArticle };
  return { surface: useCompanionArticleSurface(workspace, createFloatingBar()), snapshot, workspace };
}
