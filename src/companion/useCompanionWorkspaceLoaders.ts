import type { NativeCompanionWorkspaceSyncState } from '../../lib/platform/nativeCompanionSyncContract';
import type { CompanionReadableArticle } from '../shared/platform/companionReadableArticle';

import { useCompanionReadableArticleLoader } from './useCompanionReadableArticleLoader';
import { useCompanionVirtualFolderLoader } from './useCompanionVirtualFolderLoader';

export function useCompanionWorkspaceLoaders(args: {
  setReadableArticle: (article: CompanionReadableArticle | null) => void;
  setState: (update: (current: NativeCompanionWorkspaceSyncState) => NativeCompanionWorkspaceSyncState) => void;
  state: NativeCompanionWorkspaceSyncState;
}) {
  return {
    openReadableArticle: useCompanionReadableArticleLoader(args.state.workspace_snapshot, args.setReadableArticle),
    openVirtualFolder: useCompanionVirtualFolderLoader(args.state, args.setState)
  };
}
