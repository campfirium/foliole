import { parseLiteralUnion } from '../shared/lib/parseLiteralUnion';
import type { CompanionExternalDirectory } from '../shared/platform/companionExternalDocuments';

import type { CompanionTabAction } from './CompanionFloatingBars';
import { COMPANION_SECONDARY_DESTINATIONS, type CompanionSecondaryDestinationId } from './CompanionTabsConfig';
import type { useCompanionArticleSurface } from './useCompanionArticleSurface';
import type { useCompanionBrowseSortState } from './useCompanionBrowseSortState';
import type { useCompanionDirectorySelectionState } from './useCompanionDirectorySelectionState';
import type { CompanionSettingsPage } from './useCompanionSyncSettingsPage';
import { useCompanionTopBarProps } from './useCompanionTopBarProps';
import type { useCompanionWorkspaceSync } from './useCompanionWorkspaceSync';

const SECONDARY_DESTINATION_IDS = COMPANION_SECONDARY_DESTINATIONS.map((destination) => destination.id);

function resolveActiveSecondaryDestination(args: {
  activeAction: CompanionTabAction;
  isBrowseDirectoryOpen: boolean;
  isOnlyReviewOpen: boolean;
  settingsPage: CompanionSettingsPage;
}): CompanionSecondaryDestinationId | null {
  if (args.activeAction === 'recent' && args.isBrowseDirectoryOpen) return 'directory';
  if (args.activeAction === 'review' && args.isOnlyReviewOpen) return 'onlyReview';
  if (args.activeAction === 'more' && args.settingsPage !== 'list') {
    return parseLiteralUnion(args.settingsPage, SECONDARY_DESTINATION_IDS);
  }
  return null;
}

function useCompanionSecondaryDestinations(args: {
  activeAction: CompanionTabAction;
  isBrowseDirectoryOpen: boolean;
  isOnlyReviewOpen: boolean;
  settingsPage: CompanionSettingsPage;
  setIsBrowseDirectoryOpen(open: boolean): void;
  setIsOnlyReviewOpen(open: boolean): void;
  setSettingsPage(page: CompanionSettingsPage): void;
  surface: ReturnType<typeof useCompanionArticleSurface>;
}) {
  const handleSecondaryDestination = (destinationId: CompanionSecondaryDestinationId) => {
    if (destinationId === 'directory') {
      args.surface.handleTabAction('recent');
      args.setIsBrowseDirectoryOpen(true);
      return;
    }
    if (destinationId === 'onlyReview') {
      args.surface.handleTabAction('review');
      args.setIsOnlyReviewOpen(true);
      return;
    }
    args.surface.handleTabAction('more');
    args.setSettingsPage(destinationId);
  };
  const activeSecondaryDestinationId = resolveActiveSecondaryDestination(args);
  return { activeSecondaryDestinationId, handleSecondaryDestination };
}

export function useCompanionShellActions(args: {
  browseSortDirection: ReturnType<typeof useCompanionBrowseSortState>['browseSortDirection'];
  browseSortKey: ReturnType<typeof useCompanionBrowseSortState>['browseSortKey'];
  directoryState: ReturnType<typeof useCompanionDirectorySelectionState>;
  externalDirectory: CompanionExternalDirectory;
  isBrowseDirectoryOpen: boolean;
  isOnlyReviewOpen: boolean;
  setBrowseSortDirection: ReturnType<typeof useCompanionBrowseSortState>['setBrowseSortDirection'];
  setBrowseSortKey: ReturnType<typeof useCompanionBrowseSortState>['setBrowseSortKey'];
  setIsBrowseDirectoryOpen(open: boolean): void;
  setIsCaptureSheetOpen(open: boolean): void;
  setIsOnlyReviewOpen(open: boolean): void;
  setSettingsPage(page: CompanionSettingsPage): void;
  settingsPage: CompanionSettingsPage;
  surface: ReturnType<typeof useCompanionArticleSurface>;
  workspaceSync: ReturnType<typeof useCompanionWorkspaceSync>;
}) {
  const topBarProps = useCompanionTopBarProps({
    browseSortDirection: args.browseSortDirection,
    browseSortKey: args.browseSortKey,
    resetDirectorySelection: args.directoryState.resetDirectorySelection,
    directorySelection: args.directoryState.directorySelection,
    externalDirectory: args.externalDirectory,
    isBrowseDirectoryOpen: args.isBrowseDirectoryOpen,
    isOnlyReviewOpen: args.isOnlyReviewOpen,
    setBrowseSortDirection: args.setBrowseSortDirection,
    setBrowseSortKey: args.setBrowseSortKey,
    setIsBrowseDirectoryOpen: args.setIsBrowseDirectoryOpen,
    setIsCaptureSheetOpen: args.setIsCaptureSheetOpen,
    setIsOnlyReviewOpen: args.setIsOnlyReviewOpen,
    setSettingsPage: args.setSettingsPage,
    settingsPage: args.settingsPage,
    surface: args.surface,
    workspaceSync: args.workspaceSync
  });
  const secondaryDestinations = useCompanionSecondaryDestinations({
    activeAction: args.surface.activeAction,
    isBrowseDirectoryOpen: args.isBrowseDirectoryOpen,
    isOnlyReviewOpen: args.isOnlyReviewOpen,
    settingsPage: args.settingsPage,
    setIsBrowseDirectoryOpen: args.setIsBrowseDirectoryOpen,
    setIsOnlyReviewOpen: args.setIsOnlyReviewOpen,
    setSettingsPage: args.setSettingsPage,
    surface: args.surface
  });
  return {
    handleNavigationAction: (action: CompanionTabAction) => args.surface.handleTabAction(action),
    secondaryDestinations,
    topBarProps
  };
}
