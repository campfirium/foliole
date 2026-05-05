import type { CompanionExternalDirectory } from '../shared/platform/companionExternalDocuments';

import type { CompanionDirectorySelection } from './CompanionDirectoryContent';
import { resolveDirectoryParentSelection } from './CompanionDirectoryModel';
import { resolveCompanionTopBarProps } from './CompanionShellContent';
import type { useCompanionArticleSurface } from './useCompanionArticleSurface';
import type { CompanionSettingsPage } from './useCompanionSyncSettingsPage';
import type { useCompanionWorkspaceSync } from './useCompanionWorkspaceSync';

export function useCompanionTopBarProps(args: {
  directorySelection: CompanionDirectorySelection;
  externalDirectory: CompanionExternalDirectory;
  isBrowseDirectoryOpen: boolean;
  isOnlyReviewOpen: boolean;
  resetDirectorySelection(selection?: CompanionDirectorySelection): void;
  setIsBrowseDirectoryOpen(open: boolean): void;
  setIsCaptureSheetOpen(open: boolean): void;
  setIsOnlyReviewOpen(open: boolean): void;
  setSettingsPage(page: CompanionSettingsPage): void;
  settingsPage: CompanionSettingsPage;
  surface: ReturnType<typeof useCompanionArticleSurface>;
  workspaceSync: ReturnType<typeof useCompanionWorkspaceSync>;
}) {
  const backDirectorySelection = () => {
    const parentSelection = resolveDirectoryParentSelection({
      directory: args.externalDirectory,
      selection: args.directorySelection,
      snapshot: args.workspaceSync.state.workspace_snapshot
    });
    if (parentSelection) args.resetDirectorySelection(parentSelection);
  };
  return resolveCompanionTopBarProps(
    args.surface,
    args.settingsPage,
    args.isBrowseDirectoryOpen,
    args.isOnlyReviewOpen,
    args.directorySelection,
    () => {
      args.resetDirectorySelection();
      args.setIsBrowseDirectoryOpen(true);
    },
    () => {
      args.resetDirectorySelection();
      args.setIsBrowseDirectoryOpen(false);
    },
    args.resetDirectorySelection,
    backDirectorySelection,
    () => args.setIsCaptureSheetOpen(true),
    () => args.setIsOnlyReviewOpen(true),
    () => args.setIsOnlyReviewOpen(false),
    () => args.surface.handleTabAction('recent'),
    () => args.setSettingsPage('list'),
    () => args.setSettingsPage('sync')
  );
}
