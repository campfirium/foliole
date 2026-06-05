import { FolderTree, ListFilter, X } from 'lucide-react';

import type {
  FolderListSortDirection,
  FolderListSortKey
} from '../features/nodes/model/folderListOrdering';
import { definedProps } from '../shared/lib/definedProps';
import type { useTranslation } from '../shared/localization/LocalizationProvider';

import { CompanionBrowseTopActions } from './CompanionBrowseTopActions';
import type { CompanionDirectorySelection } from './CompanionDirectoryContent';
import type { useCompanionArticleSurface } from './useCompanionArticleSurface';
import type { CompanionSettingsPage } from './useCompanionSyncSettingsPage';

type Surface = ReturnType<typeof useCompanionArticleSurface>;
type Translate = ReturnType<typeof useTranslation>;

export function resolveCompanionTopBarProps(
  t: Translate,
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
    return resolveSettingsTopBar(t, settingsPage, onBackToSettingsList, onBackToSyncSettings);
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
      syncStatus,
      t
    });
  }
  if (surface.activeAction === 'search') return {};
  return resolveReviewTopBar(t, isOnlyReviewOpen, onCloseOnlyReview, onExitReview, onOpenOnlyReview);
}

function resolveSettingsTopBar(
  t: Translate,
  settingsPage: CompanionSettingsPage,
  onBackToSettingsList: () => void,
  onBackToSyncSettings: () => void
) {
  if (settingsPage === 'sync') return { backLabel: t('companion.settings.title'), onBack: onBackToSettingsList, title: t('companion.sync.deviceSync') };
  if (settingsPage === 'device') return { backLabel: t('companion.settings.title'), onBack: onBackToSettingsList, title: t('companion.settings.device.title') };
  if (settingsPage === 'storage') return { backLabel: t('companion.settings.title'), onBack: onBackToSettingsList, title: t('companion.settings.storage.title') };
  if (settingsPage === 'appearance') return { backLabel: t('companion.settings.title'), onBack: onBackToSettingsList, title: t('companion.settings.appearance.title') };
  if (settingsPage === 'debug') return { backLabel: t('companion.settings.title'), onBack: onBackToSettingsList, title: t('companion.settings.debug.title') };
  if (settingsPage === 'tabs') return { backLabel: t('companion.settings.title'), onBack: onBackToSettingsList, title: t('companion.settings.tabs.title') };
  if (settingsPage === 'syncActivity') return { backLabel: t('companion.sync.deviceSync'), onBack: onBackToSyncSettings, title: t('companion.sync.activity.title') };
  if (settingsPage === 'syncConnection') return { backLabel: t('companion.sync.deviceSync'), onBack: onBackToSyncSettings, title: t('companion.sync.connection.title') };
  if (settingsPage === 'syncHandoff') return { backLabel: t('companion.sync.deviceSync'), onBack: onBackToSyncSettings, title: t('companion.sync.handoff.title') };
  return { title: t('companion.settings.title') };
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
  t: Translate;
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
      : { backLabel: args.t('companion.back'), onBack: args.onBackDirectorySelection, rightSlot };
  }
  return {
    leftAction: { icon: FolderTree, label: args.t('companion.browse.directory'), onClick: args.onOpenBrowseDirectory },
    rightSlot
  };
}

function resolveReviewTopBar(
  t: Translate,
  isOnlyReviewOpen: boolean,
  onCloseOnlyReview: () => void,
  onExitReview: () => void,
  onOpenOnlyReview: () => void
) {
  if (isOnlyReviewOpen) {
    return { backLabel: t('companion.review.learn'), onBack: onCloseOnlyReview, title: t('companion.review.onlyReview') };
  }
  return {
    leftAction: { icon: X, label: t('companion.review.exit'), onClick: onExitReview },
    rightAction: { icon: ListFilter, label: t('companion.review.onlyReview'), onClick: onOpenOnlyReview }
  };
}
