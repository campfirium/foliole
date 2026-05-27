import { useEffect, useMemo, useState } from 'react';

import {
  queryHelpKnowledge,
  type HelpKnowledgeItem
} from '../../features/help/model/helpKnowledge';
import {
  appFloatingEmptyStateClassName,
  appFloatingItemClassName,
  appFloatingListClassName,
  appFloatingMetaBadgeClassName,
  appFloatingOverlayClassName,
  appFloatingSurfaceClassName
} from '../../shared/ui';

import { FloatingPaletteInput } from './FloatingPaletteInput';
import { useFloatingDialogFocusTrap } from './useFloatingDialogFocusTrap';
import { useFloatingPaletteEscape } from './useFloatingPaletteEscape';

interface HelpSearchProps {
  isOpen: boolean;
  onClose: () => void;
}

interface HelpSearchState {
  activeIndex: number;
  query: string;
  results: HelpKnowledgeItem[];
  setActiveIndex: (update: (current: number) => number) => void;
  setQuery: (value: string) => void;
}

function useHelpSearchState(isOpen: boolean): HelpSearchState {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const results = useMemo(() => queryHelpKnowledge(query), [query]);

  useEffect(() => {
    if (!isOpen) {
      setQuery('');
      setActiveIndex(0);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!results.length) {
      setActiveIndex(0);
      return;
    }
    if (activeIndex >= results.length) {
      setActiveIndex(results.length - 1);
    }
  }, [activeIndex, results]);

  return { activeIndex, query, results, setActiveIndex, setQuery };
}

export function HelpSearch({ isOpen, onClose }: HelpSearchProps) {
  const focusTrap = useFloatingDialogFocusTrap(isOpen);
  useFloatingPaletteEscape(isOpen, onClose);
  const state = useHelpSearchState(isOpen);
  if (!isOpen) {
    return null;
  }
  return (
    <div aria-label="Help Search" aria-modal="true" className={appFloatingOverlayClassName()} onClick={onClose} role="dialog">
      <div
        className={appFloatingSurfaceClassName('panel', 'w-full max-w-2xl overflow-hidden')}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={focusTrap.handleKeyDown}
        ref={focusTrap.containerRef}
      >
        <FloatingPaletteInput
          inputLabel="Search help"
          onClose={onClose}
          onQueryChange={state.setQuery}
          onRunActive={() => undefined}
          onSetActiveIndex={state.setActiveIndex}
          placeholder="Search menu help..."
          query={state.query}
          totalItems={state.results.length}
        />
        <HelpSearchResults
          activeIndex={state.activeIndex}
          query={state.query}
          results={state.results}
          setActiveIndex={state.setActiveIndex}
        />
      </div>
    </div>
  );
}

function HelpSearchResults({
  activeIndex,
  query,
  results,
  setActiveIndex
}: {
  activeIndex: number;
  query: string;
  results: HelpKnowledgeItem[];
  setActiveIndex: (update: (current: number) => number) => void;
}) {
  if (!results.length) {
    return (
      <ul className={appFloatingListClassName()}>
        <li className={appFloatingEmptyStateClassName()}>{query.trim() ? 'No matching menu help' : 'Search menu help'}</li>
      </ul>
    );
  }
  return (
    <ul aria-label="Help results" className={appFloatingListClassName()}>
      {results.map((item, index) => (
        <li key={item.id}>
          <button
            className={appFloatingItemClassName('flex flex-col gap-1')}
            data-active={index === activeIndex}
            onClick={() => {
              setActiveIndex(() => index);
            }}
            type="button"
          >
            <span className="flex items-center gap-2">
              <span className="truncate text-sm font-medium text-foreground">{item.title}</span>
              <span className={appFloatingMetaBadgeClassName()}>{item.sourceLabel}</span>
            </span>
            <span className="line-clamp-1 text-xs text-foreground/60">{item.body}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
