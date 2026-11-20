import { X } from 'lucide-react';
import { createElement, Fragment, type ComponentProps } from 'react';

import { readDiveNode } from '../../lib/core/nodes/dive';
import type {
  FolderListSortDirection,
  FolderListSortKey
} from '../features/nodes/model/folderListOrdering';
import { useLocalization } from '../shared/localization/LocalizationProvider';
import { resolveNodeDisplayTitle, resolveSystemEntryDisplayName } from '../shared/localization/systemEntryNames';
import type { CompanionExternalDirectory } from '../shared/platform/companionExternalDocuments';
import { resolveExternalFolderLabel } from '../shared/platform/externalLibraryBrowseModel';

import type { CompanionDirectorySelection } from './CompanionDirectoryContent';
import { resolveDirectoryParentSelection } from './CompanionDirectoryParentModel';
import { CompanionFlowCaptureButton } from './CompanionFlowCaptureButton';
import { CompanionFlowModeMenu } from './CompanionFlowModeControl';
import { resolveCompanionDiveStarter } from './companionStartDive';
import { CompanionTopBar } from './CompanionTopBar';
import { resolveCompanionTopBarProps } from './CompanionTopBarPropsModel';
import type { useCompanionArticleSurface } from './useCompanionArticleSurface';
import type { CompanionSettingsPage } from './useCompanionSyncSettingsPage';
import type { useCompanionWorkspaceSync } from './useCompanionWorkspaceSync';

type WorkspaceSync = ReturnType<typeof useCompanionWorkspaceSync>;

function goBackInDirectory(args: {
  externalDirectory: CompanionExternalDirectory;
  directorySelection: CompanionDirectorySelection;
  resetDirectorySelection(selection?: CompanionDirectorySelection): void;
  workspaceSync: WorkspaceSync;
}) {
  const parentSelection = resolveDirectoryParentSelection({
    directory: args.externalDirectory,
    selection: args.directorySelection,
    snapshot: args.workspaceSync.state.workspace_snapshot
  });
  if (parentSelection) args.resetDirectorySelection(parentSelection);
}

function resolveBrowseDiveActions(args: {
  directorySelection: CompanionDirectorySelection;
  isBrowseDirectoryOpen: boolean;
  surface: Pick<ReturnType<typeof useCompanionArticleSurface>, 'openDiveFlow'>;
  workspaceSync: WorkspaceSync;
}) {
  if (!args.isBrowseDirectoryOpen || args.directorySelection.kind !== 'virtual') return undefined;
  const snapshot = args.workspaceSync.state.workspace_snapshot;
  const node = snapshot?.nodesById[args.directorySelection.nodeId];
  const dive = readDiveNode(node);
  if (!dive || node?.deletedAt || snapshot?.trashedNodeIds.includes(dive.id)) return undefined;
  const startDive = resolveCompanionDiveStarter(snapshot, args.surface.openDiveFlow);
  return { dive, onStart: startDive ? () => startDive(dive.id) : undefined };
}

function resolveDirectoryTitle(
  selection: CompanionDirectorySelection,
  snapshot: WorkspaceSync['state']['workspace_snapshot'],
  directory: CompanionExternalDirectory,
  { locale, t }: ReturnType<typeof useLocalization>
) {
  if ('nodeId' in selection) return resolveNodeDisplayTitle(locale, selection.nodeId,
    snapshot?.nodesById[selection.nodeId]?.title ?? '') || t('companion.directory.title');
  if (selection.kind === 'trash') return resolveSystemEntryDisplayName(locale, 'trash');
  if (selection.kind === 'externalDirectory') return selection.directoryPath.split('/').at(-1) || t('companion.directory.section.external');
  if (selection.kind === 'externalFolder') {
    const folder = directory.folders.find(entry => entry.id === selection.folderId);
    return folder ? resolveExternalFolderLabel(folder.folderPath) : t('companion.directory.section.external');
  }
  return t('companion.directory.title');
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
  const localization = useLocalization();
  const { t } = localization;

  if (args.surface.isFlowBrowsing) return {
    title: args.surface.browsedFolder?.title ?? 'Flow',
    rightSlot: createElement(CompanionFlowCaptureButton),
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
    () => args.setIsCaptureSheetOpen(true),
    () => args.surface.handleTabAction('recent'),
    () => args.setSettingsPage('list'),
    () => args.setSettingsPage('sync'),
    () => goBackInDirectory(args),
    resolveBrowseDiveActions(args),
    args.isBrowseDirectoryOpen ? resolveDirectoryTitle(
      args.directorySelection, args.workspaceSync.state.workspace_snapshot, args.externalDirectory, localization
    ) : undefined
  );
  return withEmptyFlowMenu(resolved, args.surface);
}

function withEmptyFlowMenu(resolved: Omit<ComponentProps<typeof CompanionTopBar>, 'visible'>,
  surface: ReturnType<typeof useCompanionArticleSurface>) {
  if (surface.activeAction === 'review' && !surface.effectiveReviewSession.currentCard) {
    return { ...resolved, rightSlot: createElement(Fragment, null,
      createElement(CompanionFlowCaptureButton),
      createElement(CompanionFlowModeMenu, {
        controls: { mode: surface.flowSessionMode, onChange: surface.setFlowSessionMode, disabled: !surface.flowReady }
      })) };
  }
  return resolved;
}
