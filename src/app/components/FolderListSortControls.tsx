import type { FolderListSortDirection, FolderListSortKey } from '../../features/nodes/model/folderListOrdering';
import {
  FOLDER_LIST_SORT_OPTIONS,
  getFolderListSortOrderOptions
} from '../../features/nodes/model/folderListSortOptions';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import {
  AppDropdownMenu,
  AppDropdownMenuCheckItem,
  AppDropdownMenuContent,
  AppDropdownMenuLabel,
  AppDropdownMenuSeparator,
  AppDropdownMenuTrigger
} from '../../shared/ui';

export function FolderListSortControls(props: {
  onChangeSortDirection: (sortDirection: FolderListSortDirection) => void;
  onChangeSortKey: (sortKey: FolderListSortKey) => void;
  sortDirection: FolderListSortDirection;
  sortKey: FolderListSortKey;
}) {
  const t = useTranslation();
  const activeOption = FOLDER_LIST_SORT_OPTIONS.find((option) => option.key === props.sortKey);
  const activeLabel = activeOption ? translateSortLabel(activeOption.label, t) : t('desktop.sort.fallback.dateImported');
  const orderOptions = getFolderListSortOrderOptions(props.sortKey);
  const triggerLabel = t('desktop.sort.listBy', { label: activeLabel });

  return (
    <AppDropdownMenu>
      <AppDropdownMenuTrigger asChild>
        <button
          aria-label={triggerLabel}
          className="inline-flex h-8 items-center gap-2 bg-transparent px-0 text-sm font-medium text-foreground/72 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-border-strong"
          type="button"
        >
          <SortIcon />
          <span>{activeLabel}</span>
          <ChevronDownIcon />
        </button>
      </AppDropdownMenuTrigger>
      <AppDropdownMenuContent align="end" className="min-w-[240px]" sideOffset={8}>
        <AppDropdownMenuLabel>{t('desktop.sort.sortBy')}</AppDropdownMenuLabel>
        {FOLDER_LIST_SORT_OPTIONS.map((option) => (
          <AppDropdownMenuCheckItem
            checked={props.sortKey === option.key}
            key={option.key}
            onSelect={() => props.onChangeSortKey(option.key)}
          >
            {translateSortLabel(option.label, t)}
          </AppDropdownMenuCheckItem>
        ))}
        <AppDropdownMenuSeparator />
        <AppDropdownMenuLabel>{t('desktop.sort.order')}</AppDropdownMenuLabel>
        {orderOptions.map((option) => (
          <AppDropdownMenuCheckItem
            checked={props.sortDirection === option.value}
            key={option.value}
            onSelect={() => props.onChangeSortDirection(option.value)}
          >
            {translateSortOrderLabel(option.label, t)}
          </AppDropdownMenuCheckItem>
        ))}
      </AppDropdownMenuContent>
    </AppDropdownMenu>
  );
}

function translateSortLabel(label: string, t: ReturnType<typeof useTranslation>) {
  if (label === 'Date imported') return t('desktop.sort.fallback.dateImported');
  if (label === 'Last opened') return t('desktop.sort.key.lastOpened');
  if (label === 'Name') return t('desktop.sort.key.name');
  if (label === 'Manual') return t('desktop.sort.key.manual');
  return t('desktop.sort.key.dateModified');
}

function translateSortOrderLabel(label: string, t: ReturnType<typeof useTranslation>) {
  if (label === 'A -> Z') return t('desktop.sort.order.az');
  if (label === 'Z -> A') return t('desktop.sort.order.za');
  if (label === 'Manual order') return t('desktop.sort.order.manual');
  if (label === 'Older -> Recent') return t('desktop.sort.order.oldest');
  return t('desktop.sort.order.newest');
}

function SortIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4 text-current" viewBox="0 0 16 16">
      <path d="M5 3v10" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.1" />
      <path d="m2.8 5.1 2.2-2.2 2.2 2.2" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.1" />
      <path d="M11 13V3" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.1" />
      <path d="m8.8 10.9 2.2 2.2 2.2-2.2" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.1" />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4 text-current/75" viewBox="0 0 16 16">
      <path d="m4.5 6.5 3.5 3.5 3.5-3.5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.1" />
    </svg>
  );
}
