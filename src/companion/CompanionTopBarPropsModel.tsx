import { Library, X } from 'lucide-react';

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
  directorySelection: CompanionDirectorySelection,
  browseSortKey: FolderListSortKey,
  browseSortDirection: FolderListSortDirection,
  onChangeBrowseSortKey: (sortKey: FolderListSortKey) => void,
  onChangeBrowseSortDirection: (sortDirection: FolderListSortDirection) => void,
  onOpenBrowseDirectory: () => void,
  onOpenAddSheet: () => void,
  onSyncBrowse: (() => void) | undefined,
  syncDisabled: boolean,
  syncStatus: string | undefined,
  onExitReview: () => void,
  onBackToSettingsList: () => void,
  onBackToSyncSettings: () => void,
  onBackDirectorySelection: () => void,
  onOpenAppearance: () => void
) {
  if (surface.activeAction === 'more') {
    return resolveSettingsTopBar(t, settingsPage, onBackToSettingsList, onBackToSyncSettings);
  }
  if (surface.activeAction === 'recent') {
    return resolveBrowseTopBar({
      browseSortDirection,
      browseSortKey,
      folderTitle: surface.browsedFolder?.title,
      directorySelection,
      isBrowseDirectoryOpen,
      onBackDirectorySelection,
      onChangeBrowseSortDirection,
      onChangeBrowseSortKey,
      onOpenAddSheet,
      onOpenAppearance,
      onOpenBrowseDirectory,
      onSyncBrowse,
      syncDisabled,
      syncStatus,
      t
    });
  }
  if (surface.activeAction === 'search') return { title: t('companion.tabs.search') };
  return resolveReviewTopBar(t, onExitReview);
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
  if (settingsPage === 'syncGroup') return { backLabel: t('companion.sync.deviceSync'), onBack: onBackToSyncSettings, title: t('companion.sync.group') };
  if (settingsPage === 'syncActivity') return { backLabel: t('companion.sync.deviceSync'), onBack: onBackToSyncSettings, title: t('companion.sync.activity.title') };
  if (settingsPage === 'syncConnection') return { backLabel: t('companion.sync.deviceSync'), onBack: onBackToSyncSettings, title: t('companion.sync.connection.title') };
  return { title: t('companion.settings.title') };
}

function resolveBrowseTopBar(args: {
  browseSortDirection: FolderListSortDirection;
  browseSortKey: FolderListSortKey;
  folderTitle: string | undefined;
  directorySelection: CompanionDirectorySelection;
  isBrowseDirectoryOpen: boolean;
  onBackDirectorySelection: () => void;
  onChangeBrowseSortDirection: (sortDirection: FolderListSortDirection) => void;
  onChangeBrowseSortKey: (sortKey: FolderListSortKey) => void;
  onOpenAddSheet: () => void;
  onOpenAppearance: () => void;
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
      onOpenAppearance={args.onOpenAppearance}
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
      ? { rightSlot, title: args.t('companion.directory.title') }
      : { backLabel: args.t('companion.back'), onBack: args.onBackDirectorySelection, rightSlot, title: args.t('companion.directory.title') };
  }
  return {
    title: args.folderTitle ?? args.t('companion.browse.title'),
    leftAction: { icon: Library, label: args.t('companion.browse.directory'), onClick: args.onOpenBrowseDirectory },
    rightSlot
  };
}

function resolveReviewTopBar(t: Translate, onExitReview: () => void) {
  return {
    title: 'Flow',
    density: 'compact' as const,
    leftAction: { icon: X, label: t('companion.review.exit'), onClick: onExitReview }
  };
}
