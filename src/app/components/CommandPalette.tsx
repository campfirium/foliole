import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';

import { buildCommandMenuSections } from '../../shared/commands/menuModel';
import { formatShortcutSetLabel } from '../../shared/commands/shortcuts';
import type { CommandPaletteItem } from '../../shared/commands/types';
import { appFloatingSurfaceClassName } from '../../shared/ui';

const EMPTY_COMMAND_ITEMS: CommandPaletteItem[] = [];
const EMPTY_RECENT_COMMAND_IDS: string[] = [];

interface CommandPaletteProps {
  isOpen: boolean;
  items: CommandPaletteItem[];
  recentCommandIds: string[];
  onClose: () => void;
  onRunCommand: (id: string) => void;
}

interface PaletteInputProps {
  activeIndex: number;
  onClose: () => void;
  onQueryChange: (value: string) => void;
  onRunActive: () => void;
  onSetActiveIndex: (update: (current: number) => number) => void;
  query: string;
  totalItems: number;
}

interface CommandPaletteListProps {
  activeIndex: number;
  emptyLabel: string;
  onRunItem: (item: CommandPaletteItem | undefined) => void;
  sections: ReturnType<typeof buildCommandMenuSections>;
  visibleItems: CommandPaletteItem[];
}

function runItem(onRunCommand: (id: string) => void, item: CommandPaletteItem | undefined) {
  if (!item || !item.enabled) {
    return;
  }
  onRunCommand(item.id);
}

function handleInputKeyDown(
  event: ReactKeyboardEvent<HTMLInputElement>,
  activeIndex: number,
  totalItems: number,
  onClose: () => void,
  onSetActiveIndex: (update: (current: number) => number) => void,
  onRunActive: () => void
) {
  if (event.key === 'Escape') {
    event.preventDefault();
    onClose();
    return;
  }
  if (event.key === 'ArrowDown') {
    event.preventDefault();
    onSetActiveIndex((current) => Math.min(current + 1, Math.max(0, totalItems - 1)));
    return;
  }
  if (event.key === 'ArrowUp') {
    event.preventDefault();
    onSetActiveIndex((current) => Math.max(current - 1, 0));
    return;
  }
  if (event.key === 'Enter') {
    event.preventDefault();
    onRunActive();
  }
}

function PaletteInput({
  activeIndex,
  onClose,
  onQueryChange,
  onRunActive,
  onSetActiveIndex,
  query,
  totalItems
}: PaletteInputProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <input
      aria-label="Search commands"
      className="w-full border-b border-border bg-white px-4 py-3 text-sm outline-none"
      onChange={(event) => onQueryChange(event.target.value)}
      onKeyDown={(event) => {
        handleInputKeyDown(event, activeIndex, totalItems, onClose, onSetActiveIndex, onRunActive);
      }}
      placeholder="Type a command..."
      ref={inputRef}
      type="text"
      value={query}
    />
  );
}

function CommandPaletteList({ activeIndex, emptyLabel, onRunItem, sections, visibleItems }: CommandPaletteListProps) {
  if (!visibleItems.length) {
    return (
      <ul className="app-scrollbar max-h-[50vh] overflow-y-auto p-1">
        <li className="px-3 py-8 text-center text-sm text-foreground/55">{emptyLabel}</li>
      </ul>
    );
  }

  return (
    <ul className="app-scrollbar max-h-[50vh] overflow-y-auto p-1">
      {sections.map((section) => (
        <li key={section.id} className="mb-1">
          <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-foreground/45">{section.title}</p>
          <ul>
            {section.items.map((item) => {
              const itemIndex = visibleItems.findIndex((visibleItem) => visibleItem.id === item.id);
              return (
                <li key={item.id}>
                  <button
                    className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm hover:bg-bg-subtle data-[active=true]:bg-bg-subtle data-[disabled=true]:opacity-40"
                    data-active={itemIndex === activeIndex}
                    data-disabled={!item.enabled}
                    disabled={!item.enabled}
                    onClick={() => onRunItem(item)}
                    type="button"
                  >
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate font-medium text-foreground">{item.title}</span>
                      <span className="truncate text-xs text-foreground/60">{item.section ?? item.id}</span>
                    </span>
                    {item.shortcuts ? <span className="ml-4 text-xs text-foreground/55">{formatShortcutSetLabel(item.shortcuts)}</span> : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </li>
      ))}
    </ul>
  );
}

function useCommandPaletteState(args: Pick<CommandPaletteProps, 'isOpen' | 'items' | 'recentCommandIds'>) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const visibleItemsSource = args.isOpen ? args.items : EMPTY_COMMAND_ITEMS;
  const visibleRecentCommandIds = args.isOpen ? args.recentCommandIds : EMPTY_RECENT_COMMAND_IDS;
  const sections = useMemo(
    () => buildCommandMenuSections(visibleItemsSource, visibleRecentCommandIds, query),
    [query, visibleItemsSource, visibleRecentCommandIds]
  );
  const visibleItems = useMemo(() => sections.flatMap((section) => section.items), [sections]);

  useEffect(() => {
    if (!args.isOpen) {
      setQuery('');
      setActiveIndex(0);
    }
  }, [args.isOpen]);

  useEffect(() => {
    if (!visibleItems.length) {
      setActiveIndex(0);
      return;
    }
    if (activeIndex >= visibleItems.length) {
      setActiveIndex(visibleItems.length - 1);
    }
  }, [activeIndex, visibleItems]);

  return {
    activeIndex,
    query,
    sections,
    setActiveIndex,
    setQuery,
    visibleItems
  };
}

export function CommandPalette({ isOpen, items, recentCommandIds, onClose, onRunCommand }: CommandPaletteProps) {
  const { activeIndex, query, sections, setActiveIndex, setQuery, visibleItems } = useCommandPaletteState({
    isOpen,
    items,
    recentCommandIds
  });

  if (!isOpen) {
    return null;
  }

  const runPaletteItem = (item: CommandPaletteItem | undefined) => {
    runItem(onRunCommand, item);
  };

  return (
    <div
      aria-label="Command palette"
      className="fixed inset-0 z-50 flex items-start justify-center bg-foreground/20 px-4 pt-[12vh]"
      onClick={onClose}
      role="dialog"
    >
      <div
        className={appFloatingSurfaceClassName('panel', 'w-full max-w-xl overflow-hidden')}
        onClick={(event) => event.stopPropagation()}
      >
        <PaletteInput
          activeIndex={activeIndex}
          onClose={onClose}
          onQueryChange={setQuery}
          onRunActive={() => runPaletteItem(visibleItems[activeIndex])}
          onSetActiveIndex={setActiveIndex}
          query={query}
          totalItems={visibleItems.length}
        />
        <CommandPaletteList
          activeIndex={activeIndex}
          emptyLabel="No matching commands"
          onRunItem={runPaletteItem}
          sections={sections}
          visibleItems={visibleItems}
        />
      </div>
    </div>
  );
}
