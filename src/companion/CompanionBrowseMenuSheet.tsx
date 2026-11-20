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
import { definedProps } from '../shared/lib/definedProps';
import { useTranslation } from '../shared/localization/LocalizationProvider';
import { isNativeCompanionRuntime } from '../shared/platform/companionBootstrap';
import { isAvailableNativeCompanionRuntime } from '../shared/platform/companionWorkspaceRuntimeRepository';

import {
  COMPANION_SORT_LABEL_KEYS,
  translateCompanionSortOrderLabel
} from './companionBrowseSortLabels';
import { useCompanionDirectoryBatchMenuAction } from './CompanionDirectoryBatchMenu';
import { CompanionMenuRow, CompanionMenuSheet } from './CompanionMenuSheet';
import {
  CompanionWorkspaceCreateChoices,
  CompanionWorkspaceHistoryActions,
  useCompanionWorkspaceActions
} from './CompanionWorkspaceActions';

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
    {actions.onStart && <CompanionMenuRow label={t('desktop.nodeList.dive.startFlow')} onSelect={() => {
      onClose();
      actions.onStart?.();
    }} />}
    {reminder && isNativeCompanionRuntime() && <CompanionMenuRow label={t('settings.reminders.createForDive')} onSelect={() => {
      onClose();
      reminder.createForDive(actions.dive);
    }} />}
  </>;
}

function BrowseMainMenu(props: {
  activeSortLabel: string;
  diveActions: CompanionBrowseDiveActions | undefined;
  onClose(): void;
  onOpenNew?: () => void;
  onOpenSort?: () => void;
  onSync?: () => void;
  syncDisabled?: boolean;
  syncStatus?: string;
}) {
  const t = useTranslation();
  const select = useCompanionDirectoryBatchMenuAction();
  return (
    <>
      <CompanionWorkspaceHistoryActions />
      {select && <CompanionMenuRow label={t('companion.batch.select')} onSelect={() => {
        props.onClose();
        select();
      }} />}
      {props.diveActions && <BrowseDiveMenuActions actions={props.diveActions} onClose={props.onClose} />}
      {props.onOpenNew && <CompanionMenuRow label={t('companion.browse.new.open')} onSelect={props.onOpenNew} trailingIcon={ChevronRight} />}
      <CompanionMenuRow
        label={t('companion.settings.sync.title')}
        {...definedProps({
          disabled: props.syncDisabled,
          onSelect: props.onSync,
          status: props.syncStatus
        })}
      />
      {props.onOpenSort && <CompanionMenuRow label={t('companion.browse.sort')} onSelect={props.onOpenSort}
        status={props.activeSortLabel} trailingIcon={ChevronRight} />}
    </>
  );
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
  allowRootCreation?: boolean | undefined;
  diveActions?: CompanionBrowseDiveActions | undefined;
  onChangeSortDirection(sortDirection: FolderListSortDirection): void;
  onChangeSortKey(sortKey: FolderListSortKey): void;
  onOpenChange(open: boolean): void;
  onSync?: () => void;
  open: boolean;
  sortDirection: FolderListSortDirection;
  sortKey: FolderListSortKey;
  syncDisabled?: boolean;
  syncStatus?: string;
};

export function CompanionBrowseMenuSheet(props: CompanionBrowseMenuSheetProps) {
  const t = useTranslation();
  const workspace = useCompanionWorkspaceActions();
  const canCreate = Boolean(props.allowRootCreation && workspace && isAvailableNativeCompanionRuntime());
  const [selectedView, setView] = useState<BrowseMenuView>('menu');
  const canSort = !props.diveActions;
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
      title={view === 'menu' ? props.menuTitle : t(view === 'new' ? 'companion.browse.new.title' : 'companion.browse.sort')}
    >
      {view === 'menu' ? (
        <BrowseMainMenu
          activeSortLabel={t(COMPANION_SORT_LABEL_KEYS[props.sortKey])}
          diveActions={props.diveActions}
          onClose={close}
          {...definedProps({
            onSync: props.onSync,
            onOpenNew: canCreate ? () => setView('new') : undefined,
            onOpenSort: canSort ? () => setView('sort') : undefined,
            syncDisabled: props.syncDisabled,
            syncStatus: props.syncStatus
          })}
        />
      ) : view === 'new' ? (
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
