import { Search } from 'lucide-react';
import type { KeyboardEvent } from 'react';

import { getSettingsCategoryOption } from '../model/settingsPanelOptions';
import type { SettingsSearchResult } from '../model/settingsSearch';

import { cn } from '@/shared/lib/utils';
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

export function SettingsSearchBox(props: SettingsSearchBoxProps) {
  const hasQuery = props.query.trim().length > 0;
  const activeResult = props.results[props.activeResultIndex] ?? null;
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape' && hasQuery) {
      event.stopPropagation();
      props.onQueryChange('');
      return;
    }
    if (!props.results.length) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      props.onActiveResultIndexChange((props.activeResultIndex + 1) % props.results.length);
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      props.onActiveResultIndexChange((props.activeResultIndex - 1 + props.results.length) % props.results.length);
      return;
    }
    if (event.key === 'Enter' && activeResult) {
      event.preventDefault();
      props.onSelectResult(activeResult);
    }
  };

  return (
    <div className={cn('mb-4', props.className)}>
      <div className="relative">
        <Search aria-hidden="true" className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-foreground/38" />
        <input
          aria-label="Search settings"
          className={settingsFieldClassName(
            'h-8 rounded-md border-transparent bg-settings-control pl-8 pr-3 text-[0.92rem] text-foreground/82 placeholder:text-foreground/38 hover:border-settings-control-border hover:bg-settings-control-hover focus-visible:bg-settings-control-hover'
          )}
          onChange={(event) => props.onQueryChange(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search settings"
          value={props.query}
        />
      </div>
      {hasQuery ? (
        <div aria-label="Settings search results" className="mt-2 space-y-1" role="listbox">
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
