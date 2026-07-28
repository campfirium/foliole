import { Check, ChevronRight, ClipboardPlus, MoreHorizontal, type LucideIcon } from 'lucide-react';
import { useState } from 'react';

import type {
  FolderListSortDirection,
  FolderListSortKey
} from '../features/nodes/model/folderListOrdering';
import {
  FOLDER_LIST_SORT_OPTIONS,
  getFolderListSortOrderOptions
} from '../features/nodes/model/folderListSortOptions';
import { definedProps } from '../shared/lib/definedProps';
import { useTranslation } from '../shared/localization/LocalizationProvider';
import { supportsCompanionNodeMutationSurface } from '../shared/platform/companionWorkspaceRuntimeRepository';

import { CompanionBottomSheet } from './CompanionBottomSheet';
import {
  COMPANION_SORT_LABEL_KEYS,
  translateCompanionSortOrderLabel
} from './companionBrowseSortLabels';
import { CompanionTopActionButton } from './CompanionTopActionButton';

function MenuRow(props: {
  active?: boolean;
  disabled?: boolean;
  label: string;
  onSelect?: () => void;
  status?: string;
  trailingIcon?: LucideIcon;
}) {
  const TrailingIcon = props.trailingIcon;
  return (
    <button
      aria-disabled={props.disabled ? 'true' : undefined}
      className="flex w-full items-center justify-between gap-4 border-b border-companion-divider px-1 py-4 text-left text-foreground transition-colors active:bg-companion-subtle/80 disabled:active:bg-transparent"
      disabled={props.disabled}
      onClick={props.onSelect}
      type="button"
    >
      <span className="text-base font-medium">{props.label}</span>
      <span className="inline-flex items-center gap-2 text-sm text-companion-text-tertiary">
        {props.status}
        {TrailingIcon ? <TrailingIcon className="h-4 w-4" /> : null}
        {props.active ? <Check className="h-4 w-4 text-foreground" /> : null}
      </span>
    </button>
  );
}

type BrowseMenuView = 'menu' | 'sort';

function BrowseMenuHeader(props: {
  onBack(): void;
  view: BrowseMenuView;
}) {
  const t = useTranslation();
  return props.view === 'sort' ? (
        <button
          className="rounded-md px-2 py-1 text-sm font-medium text-companion-text-secondary transition hover:bg-companion-subtle"
          onClick={props.onBack}
          type="button"
        >
          {t('companion.back')}
        </button>
      ) : null;
}

function BrowseMainMenu(props: {
  activeSortLabel: string;
  onOpenSort(): void;
  onSync?: () => void;
  syncDisabled?: boolean;
  syncStatus?: string;
}) {
  const t = useTranslation();
  return (
    <>
      <MenuRow
        label={t('companion.settings.sync.title')}
        {...definedProps({
          disabled: props.syncDisabled,
          onSelect: props.onSync,
          status: props.syncStatus
        })}
      />
      <MenuRow label={t('companion.browse.sort')} onSelect={props.onOpenSort} status={props.activeSortLabel} trailingIcon={ChevronRight} />
      <MenuRow disabled label={t('companion.browse.theme')} status={t('companion.browse.themeUnavailable')} />
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
        <MenuRow
          active={props.sortDirection === option.value}
          key={option.value}
          label={translateCompanionSortOrderLabel(option.label, t)}
          onSelect={() => props.onChangeSortDirection(option.value)}
        />
      ))}
      <div className="px-1 pt-4 pb-1 text-xs font-medium text-companion-text-tertiary">{t('companion.browse.sortBy')}</div>
      {FOLDER_LIST_SORT_OPTIONS.map((option) => (
        <MenuRow
          active={props.sortKey === option.key}
          key={option.key}
          label={t(COMPANION_SORT_LABEL_KEYS[option.key])}
          onSelect={() => props.onChangeSortKey(option.key)}
        />
      ))}
    </>
  );
}

function CompanionBrowseMenuSheet(props: {
  onChangeSortDirection(sortDirection: FolderListSortDirection): void;
  onChangeSortKey(sortKey: FolderListSortKey): void;
  onOpenChange(open: boolean): void;
  onSync?: () => void;
  open: boolean;
  sortDirection: FolderListSortDirection;
  sortKey: FolderListSortKey;
  syncDisabled?: boolean;
  syncStatus?: string;
}) {
  const t = useTranslation();
  const [view, setView] = useState<BrowseMenuView>('menu');
  const activeSortLabel = t(COMPANION_SORT_LABEL_KEYS[props.sortKey]);
  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setView('menu');
    }
    props.onOpenChange(open);
  };

  return (
    <CompanionBottomSheet
      leadingAction={<BrowseMenuHeader onBack={() => setView('menu')} view={view} />}
      onOpenChange={handleOpenChange}
      open={props.open}
      title={view === 'sort' ? t('companion.browse.sort') : t('companion.browse.menu')}
    >
      <div className="border-t border-companion-divider">
        {view === 'menu' ? (
          <BrowseMainMenu
            activeSortLabel={activeSortLabel}
            onOpenSort={() => setView('sort')}
            {...definedProps({
              onSync: props.onSync,
              syncDisabled: props.syncDisabled,
              syncStatus: props.syncStatus
            })}
          />
        ) : (
          <BrowseSortMenu
            onChangeSortDirection={props.onChangeSortDirection}
            onChangeSortKey={props.onChangeSortKey}
            sortDirection={props.sortDirection}
            sortKey={props.sortKey}
          />
        )}
      </div>
    </CompanionBottomSheet>
  );
}

export function CompanionBrowseTopActions(props: {
  onChangeSortDirection(sortDirection: FolderListSortDirection): void;
  onChangeSortKey(sortKey: FolderListSortKey): void;
  onOpenCapture(): void;
  onSync?: () => void;
  sortDirection: FolderListSortDirection;
  sortKey: FolderListSortKey;
  syncDisabled?: boolean;
  syncStatus?: string;
}) {
  const t = useTranslation();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <div className="flex items-center gap-1">
      {supportsCompanionNodeMutationSurface('quick-capture') ? (
        <CompanionTopActionButton
          icon={ClipboardPlus}
          label={t('companion.capture.title')}
          onClick={props.onOpenCapture}
          testId="companion-capture-open"
        />
      ) : null}
      <CompanionTopActionButton icon={MoreHorizontal} label={t('companion.browse.more')} onClick={() => setIsMenuOpen(true)} />
      <CompanionBrowseMenuSheet
        onChangeSortDirection={props.onChangeSortDirection}
        onChangeSortKey={props.onChangeSortKey}
        onOpenChange={setIsMenuOpen}
        open={isMenuOpen}
        sortDirection={props.sortDirection}
        sortKey={props.sortKey}
        {...definedProps({
          onSync: props.onSync,
          syncDisabled: props.syncDisabled,
          syncStatus: props.syncStatus
        })}
      />
    </div>
  );
}
