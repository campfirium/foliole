import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent } from 'react';

import type { WorkspaceListNodesById } from '../../features/nodes/model/workspaceListNode';
import { useTranslation } from '../../shared/localization/LocalizationProvider';

import { SearchPaletteInputAndFilters } from './SearchPaletteInputAndFilters';
import { SearchPaletteEmptyState, SearchPaletteErrorState, SearchPaletteList, SearchPaletteLoadingState } from './SearchPaletteResults';
import { useOrderedSearchResults, useSearchResults } from './searchPaletteSearchState';
import { SearchPaletteShortcutsFooter, useSearchPaletteShortcuts } from './SearchPaletteShortcutsFooter';
import { useSearchResultSourceDetails } from './searchPaletteSourceDetails';
import { SearchPaletteViewOptions } from './SearchPaletteViewOptions';
import { useSearchPaletteView, type SearchPaletteView } from './searchPaletteViewPreference';
import { useFloatingDialogFocusTrap } from './useFloatingDialogFocusTrap';
import { useFloatingPaletteEscape } from './useFloatingPaletteEscape';
import { WorkspacePaletteFrame, workspacePaletteOverlayClassName } from './WorkspacePaletteFrame';
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
  const [view, setView] = useSearchPaletteView();
  const shortcuts = useSearchPaletteShortcuts();
  const searchState = useSearchResults(props, query, isComposingQuery);
  const results = useOrderedSearchResults(searchState.results, props.nodesById, searchState.aliasSpellings.length > 0);
  const sourceDetailsByNodeId = useSearchResultSourceDetails(results);
  useSearchPaletteLifecycle(props.isOpen, activeIndex, results.length, setActiveIndex, setIsComposingQuery, setQuery);
  const openActiveNode = createOpenActiveSearchResultHandler(results, activeIndex, props.onOpenResult);
  useSearchPaletteContinuation(activeIndex, results.length, searchState, setActiveIndex);

  if (!props.isOpen) return null;

  return (
    <div
      aria-label={t('desktop.search.dialog')}
      aria-modal="true"
      className={workspacePaletteOverlayClassName}
      onClick={overlayClose.handleClick}
      onMouseDown={overlayClose.handleMouseDown}
      role="dialog"
    >
      <WorkspacePaletteFrame
        onKeyDown={focusTrap.handleKeyDown}
        onClick={(event) => event.stopPropagation()}
        ref={focusTrap.containerRef}
      >
        <SearchPaletteInputAndFilters
          isOpen={props.isOpen}
          onClose={props.onClose}
          onCompositionChange={setIsComposingQuery}
          onQueryChange={setQuery}
          onRunActive={openActiveNode}
          onSetActiveIndex={setActiveIndex}
          query={query}
          searchState={searchState}
          totalItems={results.length}
        >
          <SearchPaletteViewOptions view={view} onChange={setView} />
        </SearchPaletteInputAndFilters>
        <SearchPaletteBody
          activeIndex={activeIndex}
          searchState={searchState}
          nodesById={props.nodesById}
          onOpenResult={props.onOpenResult}
          onSetActiveIndex={setActiveIndex}
          query={query}
          results={results}
          sourceDetailsByNodeId={sourceDetailsByNodeId}
          view={view}
        />
        <SearchPaletteShortcutsFooter collapsed={shortcuts.collapsed} onToggle={shortcuts.toggle} />
      </WorkspacePaletteFrame>
    </div>
  );
}

function useSearchPaletteContinuation(
  activeIndex: number,
  resultCount: number,
  state: ReturnType<typeof useSearchResults>,
  setActiveIndex: (value: number) => void
) {
  useEffect(() => {
    if (state.hasMore && resultCount > 0 && activeIndex >= resultCount - 2) state.loadMore();
  }, [activeIndex, resultCount, state.hasMore, state.loadMore]);
  useEffect(() => { setActiveIndex(0); }, [setActiveIndex, state.selectedSpelling]);
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

function SearchPaletteBody(props: {
  activeIndex: number;
  searchState: ReturnType<typeof useSearchResults>;
  nodesById: WorkspaceListNodesById;
  onOpenResult: (result: WorkspaceSearchResult, options?: { preview?: boolean }) => void;
  onSetActiveIndex: (value: number | ((current: number) => number)) => void;
  query: string;
  results: WorkspaceSearchResult[];
  sourceDetailsByNodeId: ReturnType<typeof useSearchResultSourceDetails>;
  view: SearchPaletteView;
}) {
  if (props.searchState.error) {
    return <SearchPaletteErrorState />;
  }
  if (!props.results.length && props.searchState.loading) return <SearchPaletteLoadingState />;
  if (!props.results.length) {
    return <SearchPaletteEmptyState query={props.query} />;
  }
  return (
    <SearchPaletteList
      activeIndex={props.activeIndex}
      hasMore={props.searchState.hasMore}
      nodesById={props.nodesById}
      onOpenResult={props.onOpenResult}
      onLoadMore={props.searchState.loadMore}
      onSetActiveIndex={props.onSetActiveIndex}
      query={props.query}
      results={props.results}
      selectedSpelling={props.searchState.selectedSpelling}
      sourceDetailsByNodeId={props.sourceDetailsByNodeId}
      view={props.view}
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
