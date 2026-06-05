import { useEffect, useMemo, useState } from 'react';

import { buildCommandMenuSections } from '../../shared/commands/menuModel';
import { formatAriaKeyShortcuts, formatShortcutSetLabel } from '../../shared/commands/shortcuts';
import type { CommandPaletteItem } from '../../shared/commands/types';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import {
  appFloatingEmptyStateClassName,
  appFloatingItemClassName,
  appFloatingListClassName,
  appFloatingOverlayClassName,
  appFloatingSurfaceClassName
} from '../../shared/ui';

import { FloatingPaletteInput } from './FloatingPaletteInput';
import { useFloatingDialogFocusTrap } from './useFloatingDialogFocusTrap';
import { useFloatingPaletteEscape } from './useFloatingPaletteEscape';

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
  displaySections: ReturnType<typeof buildCommandMenuSections>;
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
  displaySections,
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

  let enabledIndex = -1;
  return (
    <ul className={appFloatingListClassName()}>
      {displaySections.flatMap((section) => [
        <li className="px-3 pb-1 pt-2 text-xs font-semibold text-foreground/45 first:pt-1" key={section.id}>
          {section.title}
        </li>,
        ...section.items.map((item) => {
          if (item.enabled) {
            enabledIndex += 1;
          }
          return (
            <li key={item.id}>
              <button
                aria-keyshortcuts={formatAriaKeyShortcuts(item.shortcuts)}
                aria-label={item.title}
                className={appFloatingItemClassName('flex items-center justify-between text-sm')}
                data-active={item.enabled && enabledIndex === activeIndex}
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
          );
        })
      ])}
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
    displaySections,
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
  const t = useTranslation();
  const focusTrap = useFloatingDialogFocusTrap(isOpen);
  useFloatingPaletteEscape(isOpen, onClose);
  const { activeIndex, activeItems, displaySections, query, setActiveIndex, setQuery } =
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
      aria-label={t('desktop.palette.command.dialog')}
      aria-modal="true"
      className={appFloatingOverlayClassName()}
      onClick={onClose}
      role="dialog"
    >
      <div
        className={appFloatingSurfaceClassName('panel', 'w-full max-w-xl overflow-hidden')}
        onKeyDown={focusTrap.handleKeyDown}
        onClick={(event) => event.stopPropagation()}
        ref={focusTrap.containerRef}
      >
        <FloatingPaletteInput
          inputLabel={t('desktop.palette.command.search')}
          onClose={onClose}
          onQueryChange={setQuery}
          onRunActive={() => runPaletteItem(activeItems[activeIndex])}
          onSetActiveIndex={setActiveIndex}
          placeholder={t('desktop.palette.command.placeholder')}
          query={query}
          totalItems={activeItems.length}
        />
        <CommandPaletteList
          activeIndex={activeIndex}
          activeItems={activeItems}
          displaySections={displaySections}
          emptyLabel={t('desktop.palette.command.empty')}
          onRunItem={runPaletteItem}
        />
      </div>
    </div>
  );
}
