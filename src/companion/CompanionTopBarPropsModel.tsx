import { ChevronLeft } from 'lucide-react';

import type {
  FolderListSortDirection,
  FolderListSortKey
} from '../features/nodes/model/folderListOrdering';
import type { useTranslation } from '../shared/localization/LocalizationProvider';

import type { CompanionBrowsePage } from './CompanionBrowseContainerMenu';
import type { CompanionBrowseDiveActions } from './CompanionBrowseMenuSheet';
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
  onOpenAddSheet: () => void,
  onExitReview: () => void,
  onBackToSettingsList: () => void,
  onBackToSyncSettings: () => void,
  onBackDirectorySelection: () => void,
  diveActions?: CompanionBrowseDiveActions,
  directoryTitle?: string
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
      directoryTitle,
      diveActions,
      isBrowseDirectoryOpen,
      onBackDirectorySelection,
      onChangeBrowseSortDirection,
      onChangeBrowseSortKey,
      onOpenAddSheet,
      t
    });
  }
  if (surface.activeAction === 'search') return { title: t('companion.tabs.search') };
  if (surface.diveFlow?.stop && !surface.effectiveReviewSession.currentCard) {
    return { title: 'Flow', density: 'compact' as const };
  }
  return resolveReviewTopBar(t, onExitReview);
}

function resolveSettingsTopBar(
  t: Translate,
  settingsPage: CompanionSettingsPage,
  onBackToSettingsList: () => void,
  onBackToSyncSettings: () => void
) {
  if (settingsPage === 'foregroundTime') return { backLabel: t('companion.settings.title'), onBack: onBackToSettingsList, title: t('desktop.reviewCalendar.title') };
  if (settingsPage === 'reviewStatistics') return { backLabel: t('companion.settings.title'), onBack: onBackToSettingsList, title: t('desktop.reviewCalendar.title') };
  if (settingsPage === 'clozeGuard') return { backLabel: t('companion.settings.title'), onBack: onBackToSettingsList, title: t('settings.editor.clozeGuard.section') };
  if (settingsPage === 'reminders') return { backLabel: t('companion.settings.title'), onBack: onBackToSettingsList, title: t('settings.reminders.title') };
  if (settingsPage === 'learning') return { backLabel: t('companion.settings.title'), onBack: onBackToSettingsList, title: t('settings.category.review.label') };
  if (settingsPage === 'sync') return { backLabel: t('companion.settings.title'), onBack: onBackToSettingsList, title: t('companion.sync.deviceSync') };
  if (settingsPage === 'device') return { backLabel: t('companion.settings.title'), onBack: onBackToSettingsList, title: t('companion.settings.device.title') };
  if (settingsPage === 'backup') return { backLabel: t('companion.settings.title'), onBack: onBackToSettingsList, title: t('companion.settings.storage.databaseBackup') };
  if (settingsPage === 'attachments') return { backLabel: t('companion.settings.title'), onBack: onBackToSettingsList, title: t('settings.attachments.title') };
  if (settingsPage === 'appearance') return { backLabel: t('companion.settings.title'), onBack: onBackToSettingsList, title: t('companion.settings.appearance.title') };
  if (settingsPage === 'diagnostics') return { backLabel: t('companion.settings.title'), onBack: onBackToSettingsList, title: t('companion.settings.diagnostics.title') };
  if (settingsPage === 'logs') return { backLabel: t('companion.settings.title'), onBack: onBackToSettingsList, title: t('supportLog.title') };
  if (settingsPage === 'about') return { backLabel: t('companion.settings.title'), onBack: onBackToSettingsList, title: t('settings.category.about.label') };
  if (settingsPage === 'debug') return { backLabel: t('companion.settings.title'), onBack: onBackToSettingsList, title: t('companion.settings.debug.title') };
  if (settingsPage === 'tabs') return { backLabel: t('companion.settings.title'), onBack: onBackToSettingsList, title: t('companion.settings.tabs.title') };
  if (settingsPage === 'syncGroup') return { backLabel: t('companion.sync.deviceSync'), onBack: onBackToSyncSettings, title: t('companion.sync.group') };
  if (settingsPage === 'syncActivity') return { backLabel: t('companion.sync.deviceSync'), onBack: onBackToSyncSettings, title: t('companion.sync.activity.title') };
  if (settingsPage === 'syncConnection') return { backLabel: t('companion.sync.deviceSync'), onBack: onBackToSyncSettings, title: t('companion.sync.connection.title') };
  return { title: t('companion.settings.title') };
}

function resolveBrowsePage(open: boolean, selection: CompanionDirectorySelection,
  diveActions: CompanionBrowseDiveActions | undefined): CompanionBrowsePage {
  if (!open) return { kind: 'recent' };
  if (selection.kind === 'root') return { kind: 'root' };
  if (selection.kind === 'trash' || selection.kind === 'trashFolder') return { kind: 'trash' };
  if (diveActions) return { kind: 'dive', nodeId: diveActions.dive.id };
  if (selection.kind === 'internal') return { kind: 'folder', nodeId: selection.nodeId };
  return { kind: 'other' };
}

function resolveBrowseTopBar(args: {
  browseSortDirection: FolderListSortDirection;
  browseSortKey: FolderListSortKey;
  diveActions: CompanionBrowseDiveActions | undefined;
  folderTitle: string | undefined;
  directorySelection: CompanionDirectorySelection;
  directoryTitle: string | undefined;
  isBrowseDirectoryOpen: boolean;
  onBackDirectorySelection: () => void;
  onChangeBrowseSortDirection: (sortDirection: FolderListSortDirection) => void;
  onChangeBrowseSortKey: (sortKey: FolderListSortKey) => void;
  onOpenAddSheet: () => void;
  t: Translate;
}) {
  const title = args.isBrowseDirectoryOpen
    ? args.directoryTitle ?? args.diveActions?.dive.title ?? args.t('companion.directory.title')
    : args.folderTitle ?? args.t('companion.browse.title');
  const rightSlot = (
    <CompanionBrowseTopActions
      page={resolveBrowsePage(args.isBrowseDirectoryOpen, args.directorySelection, args.diveActions)}
      diveActions={args.diveActions}
      menuTitle={title}
      onChangeSortDirection={args.onChangeBrowseSortDirection}
      onChangeSortKey={args.onChangeBrowseSortKey}
      onOpenCapture={args.onOpenAddSheet}
      sortDirection={args.browseSortDirection}
      sortKey={args.browseSortKey}
    />
  );
  if (args.isBrowseDirectoryOpen) {
    return args.directorySelection.kind === 'root'
      ? { rightSlot, title }
      : { backLabel: args.t('companion.back'), onBack: args.onBackDirectorySelection, rightSlot, title };
  }
  return { title, rightSlot };
}

function resolveReviewTopBar(t: Translate, onExitReview: () => void) {
  return {
    title: 'Flow',
    density: 'compact' as const,
    leftAction: { icon: ChevronLeft, label: t('companion.review.exit'), onClick: onExitReview }
  };
}
