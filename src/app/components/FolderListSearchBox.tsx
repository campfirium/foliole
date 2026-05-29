import { Search, X } from 'lucide-react';

import { AppInput } from '../../shared/ui';

export function FolderListSearchBox({
  ariaLabel = 'Search folder contents',
  onChangeSearchQuery,
  placeholder = 'Search in this folder',
  readOnly = false,
  searchQuery,
  searchResultLabel
}: {
  ariaLabel?: string | undefined;
  placeholder?: string | undefined;
  readOnly?: boolean;
  searchQuery: string;
  searchResultLabel: string | null;
  onChangeSearchQuery: (value: string) => void;
}) {
  return (
    <div className="flex h-9 w-full items-center gap-2 rounded-lg border border-transparent bg-bg-subtle/70 px-3 transition-colors hover:border-border/10 hover:bg-bg-subtle focus-within:border-border/20 focus-within:bg-bg-subtle">
      <Search aria-hidden="true" className="shrink-0 text-foreground/38" size={14} strokeWidth={1.8} />
      <AppInput
        aria-label={ariaLabel}
        className="h-8 min-w-0 appearance-none !border-0 !bg-transparent px-0 text-sm shadow-none placeholder:text-foreground/38 hover:!bg-transparent focus-visible:!bg-transparent focus-visible:!ring-0 [&::-webkit-search-cancel-button]:appearance-none"
        onChange={(event) => onChangeSearchQuery(event.target.value)}
        placeholder={placeholder}
        readOnly={readOnly}
        type="search"
        value={searchQuery}
      />
      {searchResultLabel ? <FolderListSearchResultLabel searchResultLabel={searchResultLabel} /> : null}
      {searchQuery && !readOnly ? <FolderListSearchClearButton onClear={() => onChangeSearchQuery('')} /> : null}
    </div>
  );
}

function FolderListSearchResultLabel({ searchResultLabel }: { searchResultLabel: string }) {
  return (
    <span
      aria-label={`Folder search results ${searchResultLabel}`}
      className="min-w-[4.5rem] shrink-0 text-right text-xs font-medium tabular-nums text-foreground/46"
    >
      {searchResultLabel}
    </span>
  );
}

function FolderListSearchClearButton({ onClear }: { onClear: () => void }) {
  return (
    <button
      aria-label="Clear folder search"
      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-foreground/46 transition-colors hover:bg-foreground/8 hover:text-foreground/68 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      onClick={onClear}
      type="button"
    >
      <X aria-hidden="true" size={14} strokeWidth={2.2} />
    </button>
  );
}
