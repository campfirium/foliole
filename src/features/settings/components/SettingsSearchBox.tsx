import { Search } from 'lucide-react';
import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent as ReactMouseEvent, type RefObject } from 'react';

import { getSettingsCategoryOption } from '../model/settingsPanelOptions';
import type { SettingsSearchResult } from '../model/settingsSearch';

import { cn } from '@/shared/lib/utils';
import { onWindowEscape } from '@/shared/platform/keyboard';
import {
  settingsFieldClassName
} from '@/shared/ui';

export interface SettingsSearchBoxProps {
  activeResultIndex: number;
  className?: string;
  onActiveResultIndexChange: (index: number) => void;
  onQueryChange: (query: string) => void;
  onSelectResult: (result: SettingsSearchResult) => void;
  query: string;
  results: SettingsSearchResult[];
}

function SettingsSearchResultButton(props: {
  active: boolean;
  onSelect: () => void;
  result: SettingsSearchResult;
}) {
  const category = getSettingsCategoryOption(props.result.categoryId);
  return (
    <button
      aria-selected={props.active}
      className={cn(
        'flex w-full cursor-pointer flex-col items-start gap-0 rounded-md border border-transparent bg-transparent px-3 py-2 text-left text-foreground/72 transition-colors',
        'hover:bg-settings-selected hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
        props.active && 'bg-settings-selected text-foreground'
      )}
      onClick={props.onSelect}
      role="option"
      type="button"
    >
      <span className="w-full truncate text-sm font-medium">{props.result.title}</span>
      <span className="mt-0.5 w-full truncate text-xs text-foreground/55">
        {category?.label ?? 'Settings'}
        {props.result.description ? ` · ${props.result.description}` : ''}
      </span>
    </button>
  );
}

function SettingsSearchPopover(props: {
  activeResultIndex: number;
  hasQuery: boolean;
  onSelectResult: (result: SettingsSearchResult) => void;
  results: SettingsSearchResult[];
}) {
  return (
    <div className="absolute right-0 top-10 z-10 w-full rounded-md border border-settings-outline bg-settings-shell p-2 shadow-settings">
      {props.hasQuery ? (
        <div aria-label="Settings search results" className="mt-2 max-h-[360px] space-y-1 overflow-auto" role="listbox">
          {props.results.length ? props.results.map((result, index) => (
            <SettingsSearchResultButton
              active={index === props.activeResultIndex}
              key={result.id}
              onSelect={() => props.onSelectResult(result)}
              result={result}
            />
          )) : (
            <div className="rounded-md px-3 py-2 text-sm text-foreground/55">
              No settings found.
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function useSettingsSearchOpenState(rootRef: RefObject<HTMLDivElement | null>) {
  const [isOpen, setIsOpen] = useState(false);
  useEffect(() => {
    if (!isOpen) return undefined;
    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [isOpen, rootRef]);
  return [isOpen, setIsOpen] as const;
}

function useSettingsSearchEscape(params: {
  hasQuery: boolean;
  isOpen: boolean;
  onQueryChange: (query: string) => void;
  setIsOpen: (isOpen: boolean) => void;
}) {
  useEffect(() => {
    if (!params.isOpen) return undefined;
    return onWindowEscape(() => {
      if (params.hasQuery) params.onQueryChange('');
      params.setIsOpen(false);
    });
  }, [params.hasQuery, params.isOpen, params.onQueryChange, params.setIsOpen]);
}

function useSettingsSearchHandlers(params: {
  activeResultIndex: number;
  hasQuery: boolean;
  onActiveResultIndexChange: (index: number) => void;
  onQueryChange: (query: string) => void;
  onSelectResult: (result: SettingsSearchResult) => void;
  results: SettingsSearchResult[];
  setIsOpen: (isOpen: boolean) => void;
}) {
  const activeResult = params.results[params.activeResultIndex] ?? null;
  const selectResult = (result: SettingsSearchResult) => {
    params.onQueryChange('');
    params.onSelectResult(result);
    params.setIsOpen(false);
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      if (params.hasQuery) params.onQueryChange('');
      params.setIsOpen(false);
      return;
    }
    if (!params.results.length) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      params.onActiveResultIndexChange((params.activeResultIndex + 1) % params.results.length);
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      params.onActiveResultIndexChange((params.activeResultIndex - 1 + params.results.length) % params.results.length);
      return;
    }
    if (event.key === 'Enter' && activeResult) {
      event.preventDefault();
      selectResult(activeResult);
    }
  };
  return { handleKeyDown, selectResult };
}

export function SettingsSearchBox(props: SettingsSearchBoxProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isOpen, setIsOpen] = useSettingsSearchOpenState(rootRef);
  const hasQuery = props.query.trim().length > 0;
  const { handleKeyDown, selectResult } = useSettingsSearchHandlers({ ...props, hasQuery, setIsOpen });
  useSettingsSearchEscape({ hasQuery, isOpen, onQueryChange: props.onQueryChange, setIsOpen });
  const handleInputPointerDown = (event: ReactMouseEvent<HTMLInputElement>) => {
    event.stopPropagation();
    setIsOpen(true);
  };

  return (
    <div className={cn('relative w-[min(300px,100%)]', props.className)} ref={rootRef}>
      <div className="relative">
        <Search aria-hidden="true" className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-foreground/38" />
        <input
          aria-label="Search settings"
          className={settingsFieldClassName(
            'h-8 rounded-md bg-settings-control pl-8 pr-3 text-[0.86rem] text-foreground/82 shadow-control placeholder:text-foreground/38 hover:bg-settings-control-hover focus-visible:bg-settings-control-hover'
          )}
          onChange={(event) => {
            props.onQueryChange(event.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          onMouseDown={handleInputPointerDown}
          placeholder="Search all settings..."
          ref={inputRef}
          value={props.query}
        />
      </div>
      {isOpen ? (
        <SettingsSearchPopover
          activeResultIndex={props.activeResultIndex}
          hasQuery={hasQuery}
          onSelectResult={selectResult}
          results={props.results}
        />
      ) : null}
    </div>
  );
}
