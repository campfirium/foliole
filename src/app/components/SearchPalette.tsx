import { ChevronDown, ChevronUp } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent } from 'react';

import type { WorkspaceListNodesById } from '../../features/nodes/model/workspaceListNode';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import { appFloatingOverlayClassName, appFloatingSurfaceClassName } from '../../shared/ui';

import { FloatingPaletteInput } from './FloatingPaletteInput';
import { SearchPaletteEnhancementPrompt } from './SearchPaletteEnhancementPrompt';
import { SearchPaletteEmptyState, SearchPaletteErrorState, SearchPaletteList } from './SearchPaletteResults';
import { useOrderedSearchResults, useSearchResults } from './searchPaletteSearchState';
import {
  loadSearchPaletteShortcutsCollapsed,
  saveSearchPaletteShortcutsCollapsed
} from './searchPaletteShortcutsPreference';
import { useSearchResultSourceDetails } from './searchPaletteSourceDetails';
import { useFloatingDialogFocusTrap } from './useFloatingDialogFocusTrap';
import { useFloatingPaletteEscape } from './useFloatingPaletteEscape';
import type { WorkspaceSearchResult } from './workspaceSearch';

interface SearchPaletteProps {
  isOpen: boolean;
  nodeOrder: string[];
  nodesById: WorkspaceListNodesById;
  trashedNodeIds: string[];
  onClose: () => void;
  onOpenResult: (result: WorkspaceSearchResult, options?: { preview?: boolean }) => void;
}

export function SearchPalette(props: SearchPaletteProps) {
  const t = useTranslation();
  const focusTrap = useFloatingDialogFocusTrap(props.isOpen);
  useFloatingPaletteEscape(props.isOpen, props.onClose);
  const overlayClose = useOverlayClickClose(props.onClose);
  const [query, setQuery] = useState('');
  const [isComposingQuery, setIsComposingQuery] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const shortcuts = useSearchPaletteShortcuts();
  const searchState = useSearchResults(props, query, isComposingQuery);
  const results = useOrderedSearchResults(searchState.results, props.nodesById);
  const sourceDetailsByNodeId = useSearchResultSourceDetails(results);
  useSearchPaletteLifecycle(props.isOpen, activeIndex, results.length, setActiveIndex, setIsComposingQuery, setQuery);
  const openActiveNode = createOpenActiveSearchResultHandler(results, activeIndex, props.onOpenResult);

  if (!props.isOpen) return null;

  return (
    <div
      aria-label={t('desktop.search.dialog')}
      aria-modal="true"
      className={appFloatingOverlayClassName()}
      onClick={overlayClose.handleClick}
      onMouseDown={overlayClose.handleMouseDown}
      role="dialog"
    >
      <div
        className={appFloatingSurfaceClassName('panel', 'w-full max-w-2xl overflow-hidden')}
        onKeyDown={focusTrap.handleKeyDown}
        onClick={(event) => event.stopPropagation()}
        ref={focusTrap.containerRef}
      >
        <FloatingPaletteInput
          inputLabel={t('desktop.search.input')}
          onClose={props.onClose}
          onCompositionChange={setIsComposingQuery}
          onQueryChange={setQuery}
          onRunActive={openActiveNode}
          onSetActiveIndex={setActiveIndex}
          placeholder={t('desktop.search.placeholder')}
          query={query}
          totalItems={results.length}
        />
        <SearchPaletteEnhancementPrompt />
        <SearchPaletteBody
          activeIndex={activeIndex}
          hasError={searchState.error}
          nodesById={props.nodesById}
          onOpenResult={props.onOpenResult}
          onSetActiveIndex={setActiveIndex}
          query={query}
          results={results}
          sourceDetailsByNodeId={sourceDetailsByNodeId}
        />
        <SearchPaletteShortcutsFooter collapsed={shortcuts.collapsed} onToggle={shortcuts.toggle} />
      </div>
    </div>
  );
}

function useOverlayClickClose(onClose: () => void) {
  const pointerStartedOnOverlayRef = useRef(false);

  return {
    handleClick: (event: ReactMouseEvent<HTMLDivElement>) => {
      if (event.target === event.currentTarget && pointerStartedOnOverlayRef.current) {
        onClose();
      }
      pointerStartedOnOverlayRef.current = false;
    },
    handleMouseDown: (event: ReactMouseEvent<HTMLDivElement>) => {
      pointerStartedOnOverlayRef.current = event.target === event.currentTarget;
    }
  };
}

function createOpenActiveSearchResultHandler(
  results: WorkspaceSearchResult[],
  activeIndex: number,
  onOpenResult: (result: WorkspaceSearchResult, options?: { preview?: boolean }) => void
) {
  return (event: ReactKeyboardEvent<HTMLInputElement>) => {
    const result = results[activeIndex];
    if (result) onOpenResult(result, { preview: event.shiftKey });
  };
}

function useSearchPaletteShortcuts() {
  const [collapsed, setCollapsed] = useState(loadSearchPaletteShortcutsCollapsed);

  return {
    collapsed,
    toggle: () => {
      const nextCollapsed = !collapsed;
      setCollapsed(nextCollapsed);
      saveSearchPaletteShortcutsCollapsed(nextCollapsed);
    }
  };
}

function SearchPaletteBody(props: {
  activeIndex: number;
  hasError: boolean;
  nodesById: WorkspaceListNodesById;
  onOpenResult: (result: WorkspaceSearchResult, options?: { preview?: boolean }) => void;
  onSetActiveIndex: (value: number | ((current: number) => number)) => void;
  query: string;
  results: WorkspaceSearchResult[];
  sourceDetailsByNodeId: ReturnType<typeof useSearchResultSourceDetails>;
}) {
  if (props.hasError) {
    return <SearchPaletteErrorState />;
  }
  if (!props.results.length) {
    return <SearchPaletteEmptyState query={props.query} />;
  }
  return (
    <SearchPaletteList
      activeIndex={props.activeIndex}
      nodesById={props.nodesById}
      onOpenResult={props.onOpenResult}
      onSetActiveIndex={props.onSetActiveIndex}
      query={props.query}
      results={props.results}
      sourceDetailsByNodeId={props.sourceDetailsByNodeId}
    />
  );
}

function useSearchPaletteLifecycle(
  isOpen: boolean,
  activeIndex: number,
  resultCount: number,
  setActiveIndex: (value: number) => void,
  setIsComposingQuery: (value: boolean) => void,
  setQuery: (value: string) => void
) {
  useEffect(() => {
    if (!isOpen) {
      setQuery('');
      setIsComposingQuery(false);
      setActiveIndex(0);
    }
  }, [isOpen, setActiveIndex, setIsComposingQuery, setQuery]);

  useEffect(() => {
    if (!resultCount) {
      setActiveIndex(0);
      return;
    }
    if (activeIndex >= resultCount) setActiveIndex(resultCount - 1);
  }, [activeIndex, resultCount, setActiveIndex]);
}

function SearchPaletteShortcutsFooter(props: {
  collapsed: boolean;
  onToggle: () => void;
}) {
  const t = useTranslation();
  return (
    <footer className="relative flex min-h-11 items-center justify-center px-12 py-2.5 text-[11px] text-foreground/45">
      {props.collapsed ? (
        null
      ) : (
        <span className="flex min-w-0 flex-wrap items-center justify-center gap-x-5 gap-y-1.5 text-center">
          <ShortcutHint keys={['Enter']} label={t('desktop.search.shortcuts.open')} />
          <ShortcutHint keys={['Shift', 'Enter']} label={t('desktop.search.shortcuts.preview')} />
          <ShortcutHint keys={['Shift', 'Click']} label={t('desktop.search.shortcuts.preview')} />
        </span>
      )}
      <button
        aria-label={props.collapsed ? t('desktop.search.shortcuts.show') : t('desktop.search.shortcuts.collapse')}
        className="absolute right-5 top-1/2 inline-flex size-5 -translate-y-1/2 items-center justify-center rounded-sm text-foreground/32 transition-colors hover:text-foreground/58 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        onClick={props.onToggle}
        type="button"
      >
        {props.collapsed ? <ChevronUp size={14} strokeWidth={2} /> : <ChevronDown size={14} strokeWidth={2} />}
      </button>
    </footer>
  );
}

function ShortcutHint(props: {
  keys: string[];
  label: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span className="inline-flex items-center gap-0.5">
        {props.keys.map((key) => (
          <kbd className="font-semibold leading-none text-foreground/55" key={key}>
            {key}
          </kbd>
        ))}
      </span>
      <span>{props.label}</span>
    </span>
  );
}
