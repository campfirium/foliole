import { Search } from 'lucide-react';
import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent as ReactMouseEvent, type RefObject } from 'react';

import { useTranslation } from '../../../shared/localization/LocalizationProvider';
import { getSettingsCategoryOption } from '../model/settingsPanelOptions';
import type { SettingsSearchResult } from '../model/settingsSearch';

import { cn } from '@/shared/lib/utils';
import { onWindowEscape } from '@/shared/platform/keyboard';
import {
  settingsFieldClassName,
  settingsPopoverSurfaceClassName,
  settingsSelectableOptionClassName
} from '@/shared/ui';

export interface SettingsSearchBoxProps {
  activeResultIndex: number;
  className?: string;
  onActiveResultIndexChange: (index: number) => void;
  onQueryChange: (query: string) => void;
  onSelectResult: (result: SettingsSearchResult) => void;
  placeholder: string;
  query: string;
  results: SettingsSearchResult[];
}

function SettingsSearchResultButton(props: {
  active: boolean;
  onSelect: () => void;
  result: SettingsSearchResult;
}) {
  const t = useTranslation();
  const category = getSettingsCategoryOption(props.result.categoryId, t);
  return (
    <button
      aria-selected={props.active}
      className={settingsSelectableOptionClassName(props.active, 'flex w-full flex-col items-start gap-0 px-3 py-2 text-left')}
      onClick={props.onSelect}
      role="option"
      type="button"
    >
      <span className="w-full truncate text-sm font-medium">{props.result.title}</span>
      <span className="mt-0.5 w-full truncate text-xs text-foreground/55">
        {category?.label ?? t('settings.title')}
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
  const t = useTranslation();
  return (
    <div className={settingsPopoverSurfaceClassName('shell', 'absolute right-0 top-10 z-10 w-full p-2')}>
      {props.hasQuery ? (
        <div aria-label={t('settings.search.results.aria')} className="mt-2 max-h-[360px] space-y-1 overflow-auto" role="listbox">
          {props.results.length ? props.results.map((result, index) => (
            <SettingsSearchResultButton
              active={index === props.activeResultIndex}
              key={result.id}
              onSelect={() => props.onSelectResult(result)}
              result={result}
            />
          )) : (
            <div className="rounded-md px-3 py-2 text-sm text-foreground/55">
              {t('settings.search.empty')}
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
  const t = useTranslation();
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
    <div className={cn('group relative w-[min(300px,100%)]', props.className)} ref={rootRef}>
      <div className="relative">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-foreground/30 opacity-60 transition-opacity group-hover:opacity-80 group-focus-within:opacity-100"
        />
        <input
          aria-label={props.placeholder}
          className={settingsFieldClassName(
            'h-8 pl-8 pr-3 text-ui-sm text-foreground/82 opacity-60 shadow-none transition-[background-color,border-color,opacity] placeholder:text-foreground/38 hover:opacity-80 focus:opacity-100'
          )}
          onChange={(event) => {
            props.onQueryChange(event.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          onMouseDown={handleInputPointerDown}
          placeholder={t('settings.search.inputPlaceholder')}
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
