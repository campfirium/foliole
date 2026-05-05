import { useEffect, useMemo, useState } from 'react';

import { buildCommandMenuSections } from '../../shared/commands/menuModel';
import { formatShortcutSetLabel } from '../../shared/commands/shortcuts';
import type { CommandPaletteItem } from '../../shared/commands/types';
import {
  appFloatingEmptyStateClassName,
  appFloatingItemClassName,
  appFloatingListClassName,
  appFloatingOverlayClassName,
  appFloatingSurfaceClassName
} from '../../shared/ui';

import { FloatingPaletteInput } from './FloatingPaletteInput';

const EMPTY_COMMAND_ITEMS: CommandPaletteItem[] = [];
const EMPTY_RECENT_COMMAND_IDS: string[] = [];

interface CommandPaletteProps {
  isOpen: boolean;
  items: CommandPaletteItem[];
  recentCommandIds: string[];
  onClose: () => void;
  onRunCommand: (id: string) => void;
}

interface CommandPaletteListProps {
  activeIndex: number;
  activeItems: CommandPaletteItem[];
  emptyLabel: string;
  onRunItem: (item: CommandPaletteItem | undefined) => void;
}

function runItem(onRunCommand: (id: string) => void, item: CommandPaletteItem | undefined) {
  if (!item || !item.enabled) {
    return;
  }
  onRunCommand(item.id);
}

function CommandPaletteList({
  activeIndex,
  activeItems,
  emptyLabel,
  onRunItem
}: CommandPaletteListProps) {
  if (!activeItems.length) {
    return (
      <ul className={appFloatingListClassName()}>
        <li className={appFloatingEmptyStateClassName()}>{emptyLabel}</li>
      </ul>
    );
  }

  return (
    <ul className={appFloatingListClassName()}>
      {activeItems.map((item, itemIndex) => (
        <li key={item.id}>
          <button
            className={appFloatingItemClassName('flex items-center justify-between text-sm')}
            data-active={itemIndex === activeIndex}
            data-disabled={!item.enabled}
            disabled={!item.enabled}
            onClick={() => onRunItem(item)}
            type="button"
          >
            <span className="min-w-0 truncate font-medium text-foreground">{item.title}</span>
            {item.shortcuts ? (
              <span className="ml-4 text-xs text-foreground/55">
                {formatShortcutSetLabel(item.shortcuts)}
              </span>
            ) : null}
          </button>
        </li>
      ))}
    </ul>
  );
}

function useCommandPaletteState(
  args: Pick<CommandPaletteProps, 'isOpen' | 'items' | 'recentCommandIds'>
) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const visibleItemsSource = args.isOpen ? args.items : EMPTY_COMMAND_ITEMS;
  const visibleRecentCommandIds = args.isOpen ? args.recentCommandIds : EMPTY_RECENT_COMMAND_IDS;
  const sections = useMemo(
    () => buildCommandMenuSections(visibleItemsSource, visibleRecentCommandIds, query),
    [query, visibleItemsSource, visibleRecentCommandIds]
  );
  const displaySections = useMemo(() => filterDisplaySections(sections, query), [query, sections]);
  const activeItems = useMemo(
    () => displaySections.flatMap((section) => section.items).filter((item) => item.enabled),
    [displaySections]
  );

  useEffect(() => {
    if (!args.isOpen) {
      setQuery('');
      setActiveIndex(0);
    }
  }, [args.isOpen]);

  useEffect(() => {
    if (!activeItems.length) {
      setActiveIndex(0);
      return;
    }
    if (activeIndex >= activeItems.length) {
      setActiveIndex(activeItems.length - 1);
    }
  }, [activeIndex, activeItems]);

  return {
    activeIndex,
    activeItems,
    query,
    setActiveIndex,
    setQuery
  };
}

function filterDisplaySections(
  sections: ReturnType<typeof buildCommandMenuSections>,
  query: string
) {
  if (!query.trim()) {
    return sections;
  }
  return sections
    .map((section) => ({ ...section, items: section.items.filter((item) => item.enabled) }))
    .filter((section) => section.items.length > 0);
}

export function CommandPalette({
  isOpen,
  items,
  recentCommandIds,
  onClose,
  onRunCommand
}: CommandPaletteProps) {
  const { activeIndex, activeItems, query, setActiveIndex, setQuery } =
    useCommandPaletteState({
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
      className={appFloatingOverlayClassName()}
      onClick={onClose}
      role="dialog"
    >
      <div
        className={appFloatingSurfaceClassName('panel', 'w-full max-w-xl overflow-hidden')}
        onClick={(event) => event.stopPropagation()}
      >
        <FloatingPaletteInput
          inputLabel="Search commands"
          onClose={onClose}
          onQueryChange={setQuery}
          onRunActive={() => runPaletteItem(activeItems[activeIndex])}
          onSetActiveIndex={setActiveIndex}
          placeholder="Type a command..."
          query={query}
          totalItems={activeItems.length}
        />
        <CommandPaletteList
          activeIndex={activeIndex}
          activeItems={activeItems}
          emptyLabel="No matching commands"
          onRunItem={runPaletteItem}
        />
      </div>
    </div>
  );
}
