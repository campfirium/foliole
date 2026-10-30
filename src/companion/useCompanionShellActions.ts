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
  settingsPage: CompanionSettingsPage;
}): CompanionSecondaryDestinationId | null {
  if (args.activeAction === 'recent' && args.isBrowseDirectoryOpen) return 'directory';
  if (args.activeAction === 'more' && args.settingsPage !== 'list') {
    return parseLiteralUnion(args.settingsPage, SECONDARY_DESTINATION_IDS);
  }
  return null;
}

function useCompanionSecondaryDestinations(args: {
  activeAction: CompanionTabAction;
  isBrowseDirectoryOpen: boolean;
  settingsPage: CompanionSettingsPage;
  setIsBrowseDirectoryOpen(open: boolean): void;
  setSettingsPage(page: CompanionSettingsPage): void;
  surface: ReturnType<typeof useCompanionArticleSurface>;
}) {
  const handleSecondaryDestination = (destinationId: CompanionSecondaryDestinationId) => {
    if (destinationId === 'directory') {
      args.surface.handleTabAction('recent');
      args.setIsBrowseDirectoryOpen(true);
      return;
    }
    args.surface.handleTabAction('more');
    args.setSettingsPage(destinationId);
  };
  const activeSecondaryDestinationId = resolveActiveSecondaryDestination(args);
  return { activeSecondaryDestinationId, handleSecondaryDestination };
}

function handlePrimaryNavigationAction(args: {
  action: CompanionTabAction;
  browseSortKey: ReturnType<typeof useCompanionBrowseSortState>['browseSortKey'];
  isBrowseDirectoryOpen: boolean;
  setBrowseSortKey: ReturnType<typeof useCompanionBrowseSortState>['setBrowseSortKey'];
  setIsBrowseDirectoryOpen(open: boolean): void;
  setSettingsPage(page: CompanionSettingsPage): void;
  surface: ReturnType<typeof useCompanionArticleSurface>;
}) {
  if (args.action === 'recent' && args.surface.activeAction === 'recent'
    && !args.isBrowseDirectoryOpen && !args.surface.selectedBrowseNodeId && !args.surface.isFlowBrowsing) {
    args.setBrowseSortKey(args.browseSortKey === 'dateLastOpened' ? 'dateSaved' : 'dateLastOpened');
  }
  args.surface.handleTabAction(args.action);
  if (args.action === 'recent') args.setIsBrowseDirectoryOpen(false);
  if (args.action === 'more') args.setSettingsPage('list');
}

export function useCompanionShellActions(args: {
  browseSortDirection: ReturnType<typeof useCompanionBrowseSortState>['browseSortDirection'];
  browseSortKey: ReturnType<typeof useCompanionBrowseSortState>['browseSortKey'];
  directoryState: ReturnType<typeof useCompanionDirectorySelectionState>;
  externalDirectory: CompanionExternalDirectory;
  isBrowseDirectoryOpen: boolean;
  setBrowseSortDirection: ReturnType<typeof useCompanionBrowseSortState>['setBrowseSortDirection'];
  setBrowseSortKey: ReturnType<typeof useCompanionBrowseSortState>['setBrowseSortKey'];
  setIsBrowseDirectoryOpen(open: boolean): void;
  setIsCaptureSheetOpen(open: boolean): void;
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
    setBrowseSortDirection: args.setBrowseSortDirection,
    setBrowseSortKey: args.setBrowseSortKey,
    setIsBrowseDirectoryOpen: args.setIsBrowseDirectoryOpen,
    setIsCaptureSheetOpen: args.setIsCaptureSheetOpen,
    setSettingsPage: args.setSettingsPage,
    settingsPage: args.settingsPage,
    surface: args.surface,
    workspaceSync: args.workspaceSync
  });
  const secondaryDestinations = useCompanionSecondaryDestinations({
    activeAction: args.surface.activeAction,
    isBrowseDirectoryOpen: args.isBrowseDirectoryOpen,
    settingsPage: args.settingsPage,
    setIsBrowseDirectoryOpen: args.setIsBrowseDirectoryOpen,
    setSettingsPage: args.setSettingsPage,
    surface: args.surface
  });
  return {
    handleNavigationAction: (action: CompanionTabAction) => handlePrimaryNavigationAction({
      action,
      browseSortKey: args.browseSortKey,
      isBrowseDirectoryOpen: args.isBrowseDirectoryOpen,
      setBrowseSortKey: args.setBrowseSortKey,
      setIsBrowseDirectoryOpen: args.setIsBrowseDirectoryOpen,
      setSettingsPage: args.setSettingsPage,
      surface: args.surface
    }),
    secondaryDestinations,
    topBarProps
  };
}
