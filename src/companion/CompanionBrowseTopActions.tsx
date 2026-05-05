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
import {
  AppDialog,
  AppDialogClose,
  AppDialogContent,
  AppDialogOverlay,
  AppDialogPortal,
  AppDialogTitle
} from '../shared/ui';

function TopActionButton(props: {
  icon: LucideIcon;
  label: string;
  onClick(): void;
}) {
  const Icon = props.icon;
  return (
    <button
      aria-label={props.label}
      className="inline-flex h-10 w-10 items-center justify-center rounded-md text-companion-text-secondary transition hover:bg-bg-subtle/60 hover:text-foreground"
      onClick={props.onClick}
      type="button"
    >
      <Icon className="h-5 w-5" />
    </button>
  );
}

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
      className="flex w-full items-center justify-between gap-4 border-b border-companion-divider px-1 py-4 text-left text-foreground"
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
  return (
    <div className="mb-3 flex items-center justify-between">
      {props.view === 'sort' ? (
        <button
          className="rounded-md px-2 py-1 text-sm font-medium text-companion-text-secondary transition hover:bg-companion-subtle"
          onClick={props.onBack}
          type="button"
        >
          Back
        </button>
      ) : null}
      <AppDialogTitle>{props.view === 'sort' ? 'Sort' : 'Browse menu'}</AppDialogTitle>
      <AppDialogClose className="rounded-md px-2 py-1 text-sm font-medium text-companion-text-secondary transition hover:bg-companion-subtle">
        Cancel
      </AppDialogClose>
    </div>
  );
}

function BrowseMainMenu(props: {
  activeSortLabel: string;
  onOpenSort(): void;
}) {
  return (
    <>
      <MenuRow label="Sort" onSelect={props.onOpenSort} status={props.activeSortLabel} trailingIcon={ChevronRight} />
      <MenuRow disabled label="Theme" status="Not available yet" />
    </>
  );
}

function BrowseSortMenu(props: {
  onChangeSortDirection(sortDirection: FolderListSortDirection): void;
  onChangeSortKey(sortKey: FolderListSortKey): void;
  sortDirection: FolderListSortDirection;
  sortKey: FolderListSortKey;
}) {
  const orderOptions = getFolderListSortOrderOptions();
  return (
    <>
      <div className="px-1 pt-4 pb-1 text-xs font-medium text-companion-text-tertiary">Order by</div>
      {orderOptions.map((option) => (
        <MenuRow
          active={props.sortDirection === option.value}
          key={option.value}
          label={option.label}
          onSelect={() => props.onChangeSortDirection(option.value)}
        />
      ))}
      <div className="px-1 pt-4 pb-1 text-xs font-medium text-companion-text-tertiary">Sort by</div>
      {FOLDER_LIST_SORT_OPTIONS.map((option) => (
        <MenuRow
          active={props.sortKey === option.key}
          key={option.key}
          label={option.label}
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
  open: boolean;
  sortDirection: FolderListSortDirection;
  sortKey: FolderListSortKey;
}) {
  const [view, setView] = useState<BrowseMenuView>('menu');
  const activeSortLabel = FOLDER_LIST_SORT_OPTIONS.find((option) => option.key === props.sortKey)?.label ?? 'Last opened';
  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setView('menu');
    }
    props.onOpenChange(open);
  };

  return (
    <AppDialog onOpenChange={handleOpenChange} open={props.open}>
      <AppDialogPortal>
        <AppDialogOverlay />
        <AppDialogContent className="bottom-0 left-0 top-auto w-full translate-x-0 translate-y-0 rounded-b-none rounded-t-xl border-x-0 border-b-0 px-6 pb-6 pt-5">
          <div className="mx-auto w-full max-w-[760px]">
            <BrowseMenuHeader onBack={() => setView('menu')} view={view} />
            <div className="border-t border-companion-divider">
              {view === 'menu' ? (
                <BrowseMainMenu activeSortLabel={activeSortLabel} onOpenSort={() => setView('sort')} />
              ) : (
                <BrowseSortMenu
                  onChangeSortDirection={props.onChangeSortDirection}
                  onChangeSortKey={props.onChangeSortKey}
                  sortDirection={props.sortDirection}
                  sortKey={props.sortKey}
                />
              )}
            </div>
          </div>
        </AppDialogContent>
      </AppDialogPortal>
    </AppDialog>
  );
}

export function CompanionBrowseTopActions(props: {
  onChangeSortDirection(sortDirection: FolderListSortDirection): void;
  onChangeSortKey(sortKey: FolderListSortKey): void;
  onOpenCapture(): void;
  sortDirection: FolderListSortDirection;
  sortKey: FolderListSortKey;
}) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <div className="flex items-center gap-1">
      <TopActionButton icon={ClipboardPlus} label="Capture" onClick={props.onOpenCapture} />
      <TopActionButton icon={MoreHorizontal} label="More" onClick={() => setIsMenuOpen(true)} />
      <CompanionBrowseMenuSheet
        onChangeSortDirection={props.onChangeSortDirection}
        onChangeSortKey={props.onChangeSortKey}
        onOpenChange={setIsMenuOpen}
        open={isMenuOpen}
        sortDirection={props.sortDirection}
        sortKey={props.sortKey}
      />
    </div>
  );
}
