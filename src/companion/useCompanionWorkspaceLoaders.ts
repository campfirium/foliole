import { useCallback, useLayoutEffect, useRef } from 'react';

import type { NativeCompanionWorkspaceSyncState } from '../../lib/platform/nativeCompanionSyncContract';
import { getCompanionReadingScope } from '../shared/platform/companion/reading/companionReadingScope';
import type { CompanionReadableArticle } from '../shared/platform/companionReadableArticle';
import { loadCompanionWorkspaceSyncState } from '../shared/platform/companionWorkspaceSync';

import { useCompanionReadableArticleLoader } from './useCompanionReadableArticleLoader';
import { useCompanionVirtualFolderLoader } from './useCompanionVirtualFolderLoader';

export function useCompanionWorkspaceLoaders(args: {
  setReadableArticle: (article: CompanionReadableArticle | null) => void;
  setError: (message: string | null) => void;
  setState: (update: (current: NativeCompanionWorkspaceSyncState) => NativeCompanionWorkspaceSyncState) => void;
  state: NativeCompanionWorkspaceSyncState;
}) {
  const { setState } = args;
  const latestState = useRef(args.state);
  useLayoutEffect(() => { latestState.current = args.state; }, [args.state]);
  const refreshSnapshot = useCallback(async () => {
    const baseline = latestState.current;
    const scope = getCompanionReadingScope();
    const state = await loadCompanionWorkspaceSyncState();
    if (scope !== getCompanionReadingScope()) return;
    setState((current) => current === baseline ? state : current);
  }, [setState]);
  return {
    ...useCompanionReadableArticleLoader(
      args.state.workspace_snapshot, args.setReadableArticle, refreshSnapshot, args.setError
    ),
    openVirtualFolder: useCompanionVirtualFolderLoader(args.state, args.setState)
  };
}
