import { forwardRef, useEffect, useRef, useState, type RefObject } from 'react';

export interface ImportCatalogSortOption {
  ascLabel: string;
  descLabel: string;
  key: string;
  label: string;
}

function useSortMenuDismiss(open: boolean, onClose: () => void, rootRef: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    if (!open) {
      return;
    }
    const handlePointerDown = (event: PointerEvent) => {
      if (rootRef.current?.contains(event.target as Node)) {
        return;
      }
      onClose();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose, open, rootRef]);
}

function SortMenu(props: {
  activeOption: ImportCatalogSortOption;
  onChangeSortDirection: (sortDirection: 'asc' | 'desc') => void;
  onChangeSortKey: (sortKey: string) => void;
  onClose: () => void;
  options: ImportCatalogSortOption[];
  sortDirection: 'asc' | 'desc';
  sortKey: string;
}) {
  const orderOptions = [
    { label: props.activeOption.ascLabel, value: 'asc' as const },
    { label: props.activeOption.descLabel, value: 'desc' as const }
  ];

  return (
    <div className="absolute right-0 top-[calc(100%+8px)] z-20 min-w-[240px] rounded-lg border border-border/60 bg-bg-elevated p-1 shadow-panel">
      <SortOptionSection
        activeValue={props.sortKey}
        items={props.options.map((option) => ({ label: option.label, value: option.key }))}
        label="Sort by"
        onSelect={(value) => {
          props.onChangeSortKey(value);
          props.onClose();
        }}
      />
      <div className="my-1 h-px bg-border/10" />
      <SortOptionSection
        activeValue={props.sortDirection}
        items={orderOptions}
        label="Order by"
        onSelect={(value) => {
          props.onChangeSortDirection(value as 'asc' | 'desc');
          props.onClose();
        }}
      />
    </div>
  );
}

export function ImportCatalogSortControls(props: {
  onChangeSortDirection: (sortDirection: 'asc' | 'desc') => void;
  onChangeSortKey: (sortKey: string) => void;
  options: ImportCatalogSortOption[];
  sortDirection: 'asc' | 'desc';
  sortKey: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const activeOption = props.options.find((option) => option.key === props.sortKey) ?? props.options[0];
  useSortMenuDismiss(open, () => setOpen(false), rootRef);

  return (
    <div className="relative" ref={rootRef}>
      <SortTriggerButton label={activeOption.label} onClick={() => setOpen((current) => !current)} />
      {open ? (
        <SortMenu
          activeOption={activeOption}
          onChangeSortDirection={props.onChangeSortDirection}
          onChangeSortKey={props.onChangeSortKey}
          onClose={() => setOpen(false)}
          options={props.options}
          sortDirection={props.sortDirection}
          sortKey={props.sortKey}
        />
      ) : null}
    </div>
  );
}

const SortTriggerButton = forwardRef<HTMLButtonElement, { label: string; onClick: () => void }>(function SortTriggerButton({ label, onClick }, ref) {
  return (
    <button
      aria-expanded={undefined}
      aria-label={`Sort imports by ${label}`}
      className="inline-flex h-8 items-center gap-2 bg-transparent px-0 text-sm font-medium text-foreground/72 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-border-strong"
      onClick={onClick}
      ref={ref}
      type="button"
    >
      <SortIcon />
      <span>{label}</span>
      <ChevronDownIcon />
    </button>
  );
});

function SortOptionSection(props: {
  activeValue: string;
  items: Array<{ label: string; value: string }>;
  label: string;
  onSelect: (value: string) => void;
}) {
  return (
    <>
      <p className="px-3 pt-2 pb-1 text-xs font-medium text-foreground/45">{props.label}</p>
      {props.items.map((item) => (
        <button
          className="flex min-h-9 w-full items-center justify-between rounded-md px-3 text-left text-sm font-medium text-foreground outline-none transition-colors hover:bg-foreground/[0.04] focus-visible:bg-foreground/[0.04]"
          key={item.value}
          onClick={() => props.onSelect(item.value)}
          role="menuitem"
          type="button"
        >
          <span>{item.label}</span>
          <span aria-hidden="true" className={props.activeValue === item.value ? 'text-foreground' : 'invisible'}>
            <CheckIcon />
          </span>
        </button>
      ))}
    </>
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

function CheckIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 16 16">
      <path d="m3.2 8.5 3 3 6.4-6.4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.3" />
    </svg>
  );
}
