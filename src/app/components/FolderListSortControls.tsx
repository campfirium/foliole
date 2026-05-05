import type { FolderListSortKey } from '../../features/nodes/model/folderListOrdering';
import {
  AppDropdownMenu,
  AppDropdownMenuContent,
  AppDropdownMenuItem,
  AppDropdownMenuTrigger
} from '../../shared/ui';

export const FOLDER_LIST_SORT_OPTIONS: { key: FolderListSortKey; label: string }[] = [
  { key: 'date', label: 'Date' },
  { key: 'title', label: 'Title' },
  { key: 'author', label: 'Author' }
];

export function FolderListSortControls(props: {
  onChangeSortKey: (sortKey: FolderListSortKey) => void;
  sortKey: FolderListSortKey;
}) {
  const activeLabel = FOLDER_LIST_SORT_OPTIONS.find((option) => option.key === props.sortKey)?.label ?? 'Date';

  return (
    <AppDropdownMenu>
      <AppDropdownMenuTrigger asChild>
        <button
          aria-label={`Sort list by ${activeLabel}`}
          className="inline-flex h-9 items-center gap-2 rounded-full border border-border bg-bg-panel px-4 text-sm font-medium text-foreground transition-colors hover:bg-bg-subtle focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          type="button"
        >
          <SortIcon />
          <span>{activeLabel}</span>
          <ChevronDownIcon />
        </button>
      </AppDropdownMenuTrigger>
      <AppDropdownMenuContent align="end" className="min-w-[200px] p-1" sideOffset={8}>
        {FOLDER_LIST_SORT_OPTIONS.map((option) => (
          <AppDropdownMenuItem
            className="justify-between rounded-md px-3 font-medium"
            key={option.key}
            onSelect={() => props.onChangeSortKey(option.key)}
          >
            <span>{option.label}</span>
            <span aria-hidden="true" className={props.sortKey === option.key ? 'text-foreground' : 'invisible'}>
              <CheckIcon />
            </span>
          </AppDropdownMenuItem>
        ))}
      </AppDropdownMenuContent>
    </AppDropdownMenu>
  );
}

function SortIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4 text-foreground/60" viewBox="0 0 16 16">
      <path d="M5 3v10" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.1" />
      <path d="m2.8 5.1 2.2-2.2 2.2 2.2" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.1" />
      <path d="M11 13V3" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.1" />
      <path d="m8.8 10.9 2.2 2.2 2.2-2.2" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.1" />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4 text-foreground/55" viewBox="0 0 16 16">
      <path d="m4.5 6.5 3.5 3.5 3.5-3.5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.1" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 16 16">
      <path d="m3.2 8.5 3 3 6.4-6.4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.3" />
    </svg>
  );
}
