import { useEffect, useMemo, useRef, useState } from 'react';

import { buildCommandMenuSections } from '../../shared/commands/menuModel';
import { formatShortcutLabel } from '../../shared/commands/shortcuts';
import type { CommandPaletteItem } from '../../shared/commands/types';

interface CommandPaletteProps {
  isOpen: boolean;
  items: CommandPaletteItem[];
  recentCommandIds: string[];
  onClose: () => void;
  onRunCommand: (id: string) => void;
}

export function CommandPalette({ isOpen, items, recentCommandIds, onClose, onRunCommand }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const sections = useMemo(() => buildCommandMenuSections(items, recentCommandIds, query), [items, query, recentCommandIds]);
  const visibleItems = useMemo(() => sections.flatMap((section) => section.items), [sections]);

  useEffect(() => {
    if (!isOpen) {
      setQuery('');
      setActiveIndex(0);
      return;
    }
    inputRef.current?.focus();
  }, [isOpen]);

  useEffect(() => {
    if (!visibleItems.length) {
      setActiveIndex(0);
      return;
    }
    if (activeIndex >= visibleItems.length) {
      setActiveIndex(visibleItems.length - 1);
    }
  }, [activeIndex, visibleItems]);

  if (!isOpen) {
    return null;
  }

  const handleRunItem = (item: CommandPaletteItem | undefined) => {
    if (!item || !item.enabled) {
      return;
    }
    onRunCommand(item.id);
  };

  return (
    <div
      aria-label="Command palette"
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 px-4 pt-[12vh]"
      onClick={onClose}
      role="dialog"
    >
      <div className="w-full max-w-xl overflow-hidden rounded-xl border border-border bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <input
          aria-label="Search commands"
          className="w-full border-b border-border bg-white px-4 py-3 text-sm outline-none"
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              onClose();
              return;
            }
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              setActiveIndex((current) => Math.min(current + 1, Math.max(0, visibleItems.length - 1)));
              return;
            }
            if (event.key === 'ArrowUp') {
              event.preventDefault();
              setActiveIndex((current) => Math.max(current - 1, 0));
              return;
            }
            if (event.key === 'Enter') {
              event.preventDefault();
              handleRunItem(visibleItems[activeIndex]);
            }
          }}
          placeholder="Type a command..."
          ref={inputRef}
          type="text"
          value={query}
        />
        <ul className="max-h-[50vh] overflow-y-auto p-1">
          {visibleItems.length ? (
            sections.map((section) => (
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
                          onClick={() => handleRunItem(item)}
                          type="button"
                        >
                          <span className="flex min-w-0 flex-col">
                            <span className="truncate font-medium text-foreground">{item.title}</span>
                            <span className="truncate text-xs text-foreground/60">{item.section ?? item.id}</span>
                          </span>
                          {item.shortcut ? <span className="ml-4 text-xs text-foreground/55">{formatShortcutLabel(item.shortcut)}</span> : null}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))
          ) : (
            <li className="px-3 py-8 text-center text-sm text-foreground/55">No matching commands</li>
          )}
        </ul>
      </div>
    </div>
  );
}
