import type {
  FolderListSortDirection,
  FolderListSortKey
} from '../features/nodes/model/folderListOrdering';
import type { CompanionExternalDirectory } from '../shared/platform/companionExternalDocuments';

import type { CompanionDirectorySelection } from './CompanionDirectoryContent';
import { resolveDirectoryParentSelection } from './CompanionDirectoryParentModel';
import { resolveCompanionTopBarProps } from './CompanionTopBarPropsModel';
import { resolveCompanionWorkspaceSyncEndpoint } from './companionWorkspaceSyncEndpoint';
import type { useCompanionArticleSurface } from './useCompanionArticleSurface';
import type { CompanionSettingsPage } from './useCompanionSyncSettingsPage';
import type { useCompanionWorkspaceSync } from './useCompanionWorkspaceSync';

type WorkspaceSync = ReturnType<typeof useCompanionWorkspaceSync>;

function resolveBrowseSyncProps(workspaceSync: WorkspaceSync) {
  const endpointUrl = resolveCompanionWorkspaceSyncEndpoint(workspaceSync.state);
  return {
    onSync: endpointUrl
      ? () => {
          void workspaceSync.pullFromDesktop(endpointUrl);
        }
      : undefined,
    syncDisabled: !endpointUrl || workspaceSync.status === 'syncing',
    syncStatus: workspaceSync.status === 'syncing' ? 'Syncing' : endpointUrl ? undefined : 'Not connected'
  };
}

export function useCompanionTopBarProps(args: {
  directorySelection: CompanionDirectorySelection;
  browseSortDirection: FolderListSortDirection;
  browseSortKey: FolderListSortKey;
  externalDirectory: CompanionExternalDirectory;
  isBrowseDirectoryOpen: boolean;
  isOnlyReviewOpen: boolean;
  resetDirectorySelection(selection?: CompanionDirectorySelection): void;
  setBrowseSortDirection(sortDirection: FolderListSortDirection): void;
  setBrowseSortKey(sortKey: FolderListSortKey): void;
  setIsBrowseDirectoryOpen(open: boolean): void;
  setIsCaptureSheetOpen(open: boolean): void;
  setIsOnlyReviewOpen(open: boolean): void;
  setSettingsPage(page: CompanionSettingsPage): void;
  settingsPage: CompanionSettingsPage;
  surface: ReturnType<typeof useCompanionArticleSurface>;
  workspaceSync: WorkspaceSync;
}) {
  const backDirectorySelection = () => {
    const parentSelection = resolveDirectoryParentSelection({
      directory: args.externalDirectory,
      selection: args.directorySelection,
      snapshot: args.workspaceSync.state.workspace_snapshot
    });
    if (parentSelection) args.resetDirectorySelection(parentSelection);
  };
  const browseSync = resolveBrowseSyncProps(args.workspaceSync);

  return resolveCompanionTopBarProps(
    args.surface,
    args.settingsPage,
    args.isBrowseDirectoryOpen,
    args.isOnlyReviewOpen,
    args.directorySelection,
    args.browseSortKey,
    args.browseSortDirection,
    args.setBrowseSortKey,
    args.setBrowseSortDirection,
    () => {
      args.resetDirectorySelection();
      args.setIsBrowseDirectoryOpen(true);
    },
    () => args.setIsCaptureSheetOpen(true),
    () => args.setIsOnlyReviewOpen(true),
    browseSync.onSync,
    browseSync.syncDisabled,
    browseSync.syncStatus,
    () => args.setIsOnlyReviewOpen(false),
    () => args.surface.handleTabAction('recent'),
    () => args.setSettingsPage('list'),
    () => args.setSettingsPage('sync'),
    backDirectorySelection
  );
}
