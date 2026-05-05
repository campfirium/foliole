import { useEffect, useRef } from 'react';

import { AppIconButton, AppInput } from '../../../shared/ui';

function SearchTitlesIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 16 16">
      <circle cx="7" cy="7" fill="none" r="3.8" stroke="currentColor" strokeWidth="1.15" />
      <path d="m10.2 10.2 3.1 3.1" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.15" />
    </svg>
  );
}

function CloseSearchIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 16 16">
      <path d="m4 4 8 8M12 4 4 12" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.15" />
    </svg>
  );
}

export function renderSearchLauncher(onOpen: () => void) {
  return (
    <AppIconButton
      className="size-8 text-foreground/70 hover:bg-foreground/[0.04] hover:text-foreground"
      icon={<SearchTitlesIcon />}
      label="Open title search"
      onClick={onOpen}
    />
  );
}

export function NodeListSearchOverlay(props: {
  onChangeSearchQuery: (searchQuery: string) => void;
  onClose: () => void;
  searchQuery: string;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  return (
    <div className="absolute inset-y-1 left-2 right-2 z-20 flex max-w-full items-center gap-2 overflow-hidden rounded-md border border-border bg-bg-elevated px-2 shadow-sm">
      <SearchTitlesIcon />
      <AppInput
        ref={inputRef}
        aria-label="Search topic titles"
        className="h-8 min-w-0 border-0 bg-transparent px-0 text-[14px] focus-visible:ring-0"
        onChange={(event) => props.onChangeSearchQuery(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            props.onClose();
          }
        }}
        placeholder="Search titles"
        type="search"
        value={props.searchQuery}
      />
      <AppIconButton
        className="size-8 text-foreground/60 hover:bg-foreground/[0.04] hover:text-foreground"
        icon={<CloseSearchIcon />}
        label="Close title search"
        onClick={props.onClose}
      />
    </div>
  );
}
