import { ChevronRight } from 'lucide-react';
import { useState } from 'react';

import type { Dive } from '../../lib/core/nodes/dive';
import type {
  FolderListSortDirection,
  FolderListSortKey
} from '../features/nodes/model/folderListOrdering';
import {
  FOLDER_LIST_SORT_OPTIONS,
  getFolderListSortOrderOptions
} from '../features/nodes/model/folderListSortOptions';
import { useReminderDraftRequest } from '../features/settings/context/ReminderDraftRequest';
import { useTranslation } from '../shared/localization/LocalizationProvider';
import { isNativeCompanionRuntime } from '../shared/platform/companionBootstrap';

import { toggleCompanionBrowseShowChildTopics, useCompanionBrowseShowChildTopics } from './companionBrowseChildTopics';
import {
  CompanionBrowseContainerActions,
  CompanionBrowseContainerSection,
  CompanionFolderCreateChoices,
  type CompanionBrowsePage
} from './CompanionBrowseContainerMenu';
import {
  COMPANION_SORT_LABEL_KEYS,
  translateCompanionSortOrderLabel
} from './companionBrowseSortLabels';
import { useCompanionDirectoryBatchMenuAction, useCompanionEmptyTrashMenuAction } from './CompanionDirectoryBatchMenu';
import { CompanionMenuRow, CompanionMenuSheet } from './CompanionMenuSheet';
import { CompanionWorkspaceCreateChoices, CompanionWorkspaceHistoryActions } from './CompanionWorkspaceActions';

type BrowseMenuView = 'menu' | 'new' | 'sort';

function BrowseMenuHeader(props: {
  onBack(): void;
  view: BrowseMenuView;
}) {
  const t = useTranslation();
  return props.view !== 'menu' ? (
        <button
          className="min-h-11 rounded-md px-2 text-sm font-medium text-companion-text-secondary transition hover:bg-companion-subtle"
          onClick={props.onBack}
          type="button"
        >
          {t('companion.back')}
        </button>
      ) : null;
}

export type CompanionBrowseDiveActions = { dive: Dive; onStart?: (() => void) | undefined };

function BrowseDiveMenuActions({ actions, onClose }: { actions: CompanionBrowseDiveActions; onClose(): void }) {
  const t = useTranslation();
  const reminder = useReminderDraftRequest();
  return <>
    {reminder && isNativeCompanionRuntime() && <CompanionMenuRow label={t('settings.reminders.createForDive')} onSelect={() => {
      onClose();
      reminder.createForDive(actions.dive);
    }} />}
  </>;
}

function BrowseMainMenu(props: {
  activeSortLabel: string;
  diveActions: CompanionBrowseDiveActions | undefined;
  page: CompanionBrowsePage;
  onClose(): void;
  onOpenNew(): void;
  onOpenSort?: () => void;
}) {
  const t = useTranslation();
  const select = useCompanionDirectoryBatchMenuAction();
  const emptyTrash = useCompanionEmptyTrashMenuAction();
  return (
    <>
      <CompanionWorkspaceHistoryActions />
      {select && <CompanionMenuRow label={t('companion.batch.select')} onSelect={() => {
        props.onClose();
        select();
      }} />}
      <CompanionBrowseContainerActions page={props.page} onClose={props.onClose} onOpenCreate={props.onOpenNew} />
      {props.diveActions && <BrowseDiveMenuActions actions={props.diveActions} onClose={props.onClose} />}
      {props.onOpenSort && <CompanionMenuRow label={t('companion.browse.sort')} onSelect={props.onOpenSort}
        status={props.activeSortLabel} trailingIcon={ChevronRight} />}
      {props.page.kind === 'recent' && <BrowseChildTopicsRow />}
      {emptyTrash && <CompanionMenuRow destructive label={t('companion.batch.emptyTrash')} onSelect={() => {
        props.onClose();
        emptyTrash();
      }} />}
      <CompanionBrowseContainerSection page={props.page} onClose={props.onClose} />
    </>
  );
}

/** Browse-only display choice; folders already reach child topics by opening their topic. */
function BrowseChildTopicsRow() {
  const t = useTranslation();
  const shown = useCompanionBrowseShowChildTopics();
  return <CompanionMenuRow active={shown} label={t('companion.browse.showChildTopics')} onSelect={toggleCompanionBrowseShowChildTopics} />;
}

function BrowseSortMenu(props: {
  onChangeSortDirection(sortDirection: FolderListSortDirection): void;
  onChangeSortKey(sortKey: FolderListSortKey): void;
  sortDirection: FolderListSortDirection;
  sortKey: FolderListSortKey;
}) {
  const t = useTranslation();
  const orderOptions = getFolderListSortOrderOptions();
  return (
    <>
      <div className="px-1 pt-4 pb-1 text-xs font-medium text-companion-text-tertiary">{t('companion.browse.orderBy')}</div>
      {orderOptions.map((option) => (
        <CompanionMenuRow
          active={props.sortDirection === option.value}
          key={option.value}
          label={translateCompanionSortOrderLabel(option.label, t)}
          onSelect={() => props.onChangeSortDirection(option.value)}
        />
      ))}
      <div className="px-1 pt-4 pb-1 text-xs font-medium text-companion-text-tertiary">{t('companion.browse.sortBy')}</div>
      {FOLDER_LIST_SORT_OPTIONS.map((option) => (
        <CompanionMenuRow
          active={props.sortKey === option.key}
          key={option.key}
          label={t(COMPANION_SORT_LABEL_KEYS[option.key])}
          onSelect={() => props.onChangeSortKey(option.key)}
        />
      ))}
    </>
  );
}

type CompanionBrowseMenuSheetProps = {
  menuTitle: string;
  page: CompanionBrowsePage;
  diveActions?: CompanionBrowseDiveActions | undefined;
  onChangeSortDirection(sortDirection: FolderListSortDirection): void;
  onChangeSortKey(sortKey: FolderListSortKey): void;
  onOpenChange(open: boolean): void;
  open: boolean;
  sortDirection: FolderListSortDirection;
  sortKey: FolderListSortKey;
};

export function CompanionBrowseMenuSheet(props: CompanionBrowseMenuSheetProps) {
  const t = useTranslation();
  const page = props.page;
  const canCreate = page.kind === 'folder' || page.kind === 'root';
  const [selectedView, setView] = useState<BrowseMenuView>('menu');
  const canSort = page.kind !== 'root' && page.kind !== 'dive' && !props.diveActions;
  const view = (selectedView === 'new' && !canCreate) || (selectedView === 'sort' && !canSort) ? 'menu' : selectedView;
  const handleOpenChange = (open: boolean) => {
    if (!open) setView('menu');
    props.onOpenChange(open);
  };
  const close = () => handleOpenChange(false);

  return (
    <CompanionMenuSheet
      leadingAction={<BrowseMenuHeader onBack={() => setView('menu')} view={view} />}
      onOpenChange={handleOpenChange}
      open={props.open}
      title={view === 'menu' ? props.menuTitle : t(view === 'new' ? 'companion.browse.createHere' : 'companion.browse.sort')}
    >
      {view === 'menu' ? (
        <BrowseMainMenu
          activeSortLabel={t(COMPANION_SORT_LABEL_KEYS[props.sortKey])}
          diveActions={props.diveActions}
          page={page}
          onClose={close}
          onOpenNew={() => setView('new')}
          {...(canSort ? { onOpenSort: () => setView('sort') } : {})}
        />
      ) : view === 'new' && page.kind === 'folder' ? (
        <CompanionFolderCreateChoices nodeId={page.nodeId} onClose={close} />
      ) : view === 'new' && page.kind === 'root' ? (
        <CompanionWorkspaceCreateChoices onSelect={close} />
      ) : (
        <BrowseSortMenu
          onChangeSortDirection={props.onChangeSortDirection}
          onChangeSortKey={props.onChangeSortKey}
          sortDirection={props.sortDirection}
          sortKey={props.sortKey}
        />
      )}
    </CompanionMenuSheet>
  );
}
