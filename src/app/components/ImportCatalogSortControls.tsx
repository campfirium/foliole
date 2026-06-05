import { useTranslation } from '../../shared/localization/LocalizationProvider';
import {
  AppDropdownMenu,
  AppDropdownMenuCheckItem,
  AppDropdownMenuContent,
  AppDropdownMenuLabel,
  AppDropdownMenuSeparator,
  AppDropdownMenuTrigger
} from '../../shared/ui';

export interface ImportCatalogSortOption {
  ascLabel: string;
  descLabel: string;
  key: string;
  label: string;
}

export function ImportCatalogSortControls(props: {
  onChangeSortDirection: (sortDirection: 'asc' | 'desc') => void;
  onChangeSortKey: (sortKey: string) => void;
  options: ImportCatalogSortOption[];
  sortDirection: 'asc' | 'desc';
  sortKey: string;
}) {
  const t = useTranslation();
  const activeOption = props.options.find((option) => option.key === props.sortKey) ?? props.options[0];
  const activeLabel = activeOption?.label ?? t('desktop.importCatalog.sort.dateImported');
  const orderOptions = [
    { label: activeOption?.descLabel ?? t('desktop.importCatalog.sort.recentOlder'), value: 'desc' as const },
    { label: activeOption?.ascLabel ?? t('desktop.importCatalog.sort.olderRecent'), value: 'asc' as const }
  ];

  return (
    <AppDropdownMenu>
      <AppDropdownMenuTrigger asChild>
        <button
          aria-label={t('desktop.importCatalog.sort.aria', { label: activeLabel })}
          className="inline-flex h-8 items-center gap-2 bg-transparent px-0 text-sm font-medium text-foreground/72 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-border-strong"
          type="button"
        >
          <SortIcon />
          <span>{activeLabel}</span>
          <ChevronDownIcon />
        </button>
      </AppDropdownMenuTrigger>
      <ImportCatalogSortMenu
        onChangeSortDirection={props.onChangeSortDirection}
        onChangeSortKey={props.onChangeSortKey}
        options={props.options}
        orderOptions={orderOptions}
        sortDirection={props.sortDirection}
        sortKey={props.sortKey}
      />
    </AppDropdownMenu>
  );
}

function ImportCatalogSortMenu(props: {
  onChangeSortDirection: (sortDirection: 'asc' | 'desc') => void;
  onChangeSortKey: (sortKey: string) => void;
  options: ImportCatalogSortOption[];
  orderOptions: Array<{ label: string; value: 'asc' | 'desc' }>;
  sortDirection: 'asc' | 'desc';
  sortKey: string;
}) {
  const t = useTranslation();
  return (
    <AppDropdownMenuContent align="end" className="z-dropdown min-w-[240px]" sideOffset={8}>
      <AppDropdownMenuLabel>{t('desktop.importCatalog.sort.by')}</AppDropdownMenuLabel>
      {props.options.map((option) => (
        <AppDropdownMenuCheckItem
          checked={props.sortKey === option.key}
          key={option.key}
          onSelect={() => props.onChangeSortKey(option.key)}
        >
          {option.label}
        </AppDropdownMenuCheckItem>
      ))}
      <AppDropdownMenuSeparator />
      <AppDropdownMenuLabel>{t('desktop.importCatalog.sort.order')}</AppDropdownMenuLabel>
      {props.orderOptions.map((option) => (
        <AppDropdownMenuCheckItem
          checked={props.sortDirection === option.value}
          key={option.value}
          onSelect={() => props.onChangeSortDirection(option.value)}
        >
          {option.label}
        </AppDropdownMenuCheckItem>
      ))}
    </AppDropdownMenuContent>
  );
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
