import { X } from 'lucide-react';
import { createElement, type ComponentProps } from 'react';

import type {
  FolderListSortDirection,
  FolderListSortKey
} from '../features/nodes/model/folderListOrdering';
import { useTranslation } from '../shared/localization/LocalizationProvider';
import type { CompanionExternalDirectory } from '../shared/platform/companionExternalDocuments';

import type { CompanionDirectorySelection } from './CompanionDirectoryContent';
import { resolveDirectoryParentSelection } from './CompanionDirectoryParentModel';
import { CompanionFlowModeMenu } from './CompanionFlowModeControl';
import { CompanionTopBar } from './CompanionTopBar';
import { resolveCompanionTopBarProps } from './CompanionTopBarPropsModel';
import { resolveCompanionWorkspaceSyncEndpoint } from './companionWorkspaceSyncEndpoint';
import type { useCompanionArticleSurface } from './useCompanionArticleSurface';
import type { CompanionSettingsPage } from './useCompanionSyncSettingsPage';
import type { useCompanionWorkspaceSync } from './useCompanionWorkspaceSync';

type WorkspaceSync = ReturnType<typeof useCompanionWorkspaceSync>;

function resolveBrowseSyncProps(workspaceSync: WorkspaceSync, t: ReturnType<typeof useTranslation>) {
  const endpointUrl = resolveCompanionWorkspaceSyncEndpoint(workspaceSync.state);
  return {
    onSync: endpointUrl
      ? () => {
          void workspaceSync.pullFromDesktop(endpointUrl);
        }
      : undefined,
    syncDisabled: !endpointUrl || workspaceSync.status === 'syncing',
    syncStatus: workspaceSync.status === 'syncing' ? t('companion.browse.syncing') : endpointUrl ? undefined : t('companion.browse.notConnected')
  };
}

export function useCompanionTopBarProps(args: {
  directorySelection: CompanionDirectorySelection;
  browseSortDirection: FolderListSortDirection;
  browseSortKey: FolderListSortKey;
  externalDirectory: CompanionExternalDirectory;
  isBrowseDirectoryOpen: boolean;
  resetDirectorySelection(selection?: CompanionDirectorySelection): void;
  setBrowseSortDirection(sortDirection: FolderListSortDirection): void;
  setBrowseSortKey(sortKey: FolderListSortKey): void;
  setIsBrowseDirectoryOpen(open: boolean): void;
  setIsCaptureSheetOpen(open: boolean): void;
  setSettingsPage(page: CompanionSettingsPage): void;
  settingsPage: CompanionSettingsPage;
  surface: ReturnType<typeof useCompanionArticleSurface>;
  workspaceSync: WorkspaceSync;
}) {
  const t = useTranslation();
  const backDirectorySelection = () => {
    const parentSelection = resolveDirectoryParentSelection({
      directory: args.externalDirectory,
      selection: args.directorySelection,
      snapshot: args.workspaceSync.state.workspace_snapshot
    });
    if (parentSelection) args.resetDirectorySelection(parentSelection);
  };
  const browseSync = resolveBrowseSyncProps(args.workspaceSync, t);

  if (args.surface.isFlowBrowsing) return {
    title: args.surface.browsedFolder?.title ?? 'Flow',
    leftAction: { icon: X, label: t('companion.review.exit'), onClick: () => args.surface.handleTabAction('recent') }
  };

  const resolved = resolveCompanionTopBarProps(
    t,
    args.surface,
    args.settingsPage,
    args.isBrowseDirectoryOpen,
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
    browseSync.onSync,
    browseSync.syncDisabled,
    browseSync.syncStatus,
    () => args.surface.handleTabAction('recent'),
    () => args.setSettingsPage('list'),
    () => args.setSettingsPage('sync'),
    backDirectorySelection,
    () => {
      args.surface.handleTabAction('more');
      args.setSettingsPage('appearance');
    }
  );
  return withEmptyFlowMenu(resolved, args.surface);
}

function withEmptyFlowMenu(resolved: Omit<ComponentProps<typeof CompanionTopBar>, 'visible'>,
  surface: ReturnType<typeof useCompanionArticleSurface>) {
  if (surface.activeAction === 'review' && !surface.effectiveReviewSession.currentCard) {
    return { ...resolved, rightSlot: createElement(CompanionFlowModeMenu, {
        mode: surface.flowSessionMode, onChange: surface.setFlowSessionMode,
        disabled: !surface.flowReady
      }) };
  }
  return resolved;
}
