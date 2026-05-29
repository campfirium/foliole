import { FolderTree, ListFilter, X } from 'lucide-react';

import type {
  FolderListSortDirection,
  FolderListSortKey
} from '../features/nodes/model/folderListOrdering';
import { definedProps } from '../shared/lib/definedProps';

import { CompanionBrowseTopActions } from './CompanionBrowseTopActions';
import type { CompanionDirectorySelection } from './CompanionDirectoryContent';
import type { useCompanionArticleSurface } from './useCompanionArticleSurface';
import type { CompanionSettingsPage } from './useCompanionSyncSettingsPage';

type Surface = ReturnType<typeof useCompanionArticleSurface>;

export function resolveCompanionTopBarProps(
  surface: Surface,
  settingsPage: CompanionSettingsPage,
  isBrowseDirectoryOpen: boolean,
  isOnlyReviewOpen: boolean,
  directorySelection: CompanionDirectorySelection,
  browseSortKey: FolderListSortKey,
  browseSortDirection: FolderListSortDirection,
  onChangeBrowseSortKey: (sortKey: FolderListSortKey) => void,
  onChangeBrowseSortDirection: (sortDirection: FolderListSortDirection) => void,
  onOpenBrowseDirectory: () => void,
  onOpenAddSheet: () => void,
  onOpenOnlyReview: () => void,
  onSyncBrowse: (() => void) | undefined,
  syncDisabled: boolean,
  syncStatus: string | undefined,
  onCloseOnlyReview: () => void,
  onExitReview: () => void,
  onBackToSettingsList: () => void,
  onBackToSyncSettings: () => void,
  onBackDirectorySelection: () => void
) {
  if (surface.activeAction === 'more') {
    return resolveSettingsTopBar(settingsPage, onBackToSettingsList, onBackToSyncSettings);
  }
  if (surface.activeAction === 'recent') {
    return resolveBrowseTopBar({
      browseSortDirection,
      browseSortKey,
      directorySelection,
      isBrowseDirectoryOpen,
      onBackDirectorySelection,
      onChangeBrowseSortDirection,
      onChangeBrowseSortKey,
      onOpenAddSheet,
      onOpenBrowseDirectory,
      onSyncBrowse,
      syncDisabled,
      syncStatus
    });
  }
  if (surface.activeAction === 'search') return {};
  return resolveReviewTopBar(isOnlyReviewOpen, onCloseOnlyReview, onExitReview, onOpenOnlyReview);
}

function resolveSettingsTopBar(
  settingsPage: CompanionSettingsPage,
  onBackToSettingsList: () => void,
  onBackToSyncSettings: () => void
) {
  if (settingsPage === 'sync') return { backLabel: 'Settings', onBack: onBackToSettingsList, title: 'Device sync' };
  if (settingsPage === 'device') return { backLabel: 'Settings', onBack: onBackToSettingsList, title: 'Device' };
  if (settingsPage === 'storage') return { backLabel: 'Settings', onBack: onBackToSettingsList, title: 'Storage' };
  if (settingsPage === 'appearance') return { backLabel: 'Settings', onBack: onBackToSettingsList, title: 'Appearance' };
  if (settingsPage === 'debug') return { backLabel: 'Settings', onBack: onBackToSettingsList, title: 'Debug' };
  if (settingsPage === 'tabs') return { backLabel: 'Settings', onBack: onBackToSettingsList, title: 'Tabs' };
  if (settingsPage === 'syncActivity') return { backLabel: 'Device sync', onBack: onBackToSyncSettings, title: 'Activity' };
  if (settingsPage === 'syncConnection') return { backLabel: 'Device sync', onBack: onBackToSyncSettings, title: 'Connection' };
  if (settingsPage === 'syncHandoff') return { backLabel: 'Device sync', onBack: onBackToSyncSettings, title: 'Handoff reminders' };
  return { title: 'Settings' };
}

function resolveBrowseTopBar(args: {
  browseSortDirection: FolderListSortDirection;
  browseSortKey: FolderListSortKey;
  directorySelection: CompanionDirectorySelection;
  isBrowseDirectoryOpen: boolean;
  onBackDirectorySelection: () => void;
  onChangeBrowseSortDirection: (sortDirection: FolderListSortDirection) => void;
  onChangeBrowseSortKey: (sortKey: FolderListSortKey) => void;
  onOpenAddSheet: () => void;
  onOpenBrowseDirectory: () => void;
  onSyncBrowse: (() => void) | undefined;
  syncDisabled: boolean;
  syncStatus: string | undefined;
}) {
  const rightSlot = (
    <CompanionBrowseTopActions
      onChangeSortDirection={args.onChangeBrowseSortDirection}
      onChangeSortKey={args.onChangeBrowseSortKey}
      onOpenCapture={args.onOpenAddSheet}
      sortDirection={args.browseSortDirection}
      sortKey={args.browseSortKey}
      {...definedProps({
        onSync: args.onSyncBrowse,
        syncDisabled: args.syncDisabled,
        syncStatus: args.syncStatus
      })}
    />
  );
  if (args.isBrowseDirectoryOpen) {
    return args.directorySelection.kind === 'root'
      ? { rightSlot }
      : { backLabel: 'Back', onBack: args.onBackDirectorySelection, rightSlot };
  }
  return {
    leftAction: { icon: FolderTree, label: 'Directory', onClick: args.onOpenBrowseDirectory },
    rightSlot
  };
}

function resolveReviewTopBar(
  isOnlyReviewOpen: boolean,
  onCloseOnlyReview: () => void,
  onExitReview: () => void,
  onOpenOnlyReview: () => void
) {
  if (isOnlyReviewOpen) {
    return { backLabel: 'Learn', onBack: onCloseOnlyReview, title: 'Only Review' };
  }
  return {
    leftAction: { icon: X, label: 'Exit', onClick: onExitReview },
    rightAction: { icon: ListFilter, label: 'Only Review', onClick: onOpenOnlyReview }
  };
}
