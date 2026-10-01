import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent } from 'react';

import type { WorkspaceListNodesById } from '../../features/nodes/model/workspaceListNode';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import { appFloatingOverlayClassName, appFloatingSurfaceClassName } from '../../shared/ui';

import { FloatingPaletteInput } from './FloatingPaletteInput';
import { SearchAliasFilters } from './SearchAliasFilters';
import { SearchPaletteEnhancementPrompt } from './SearchPaletteEnhancementPrompt';
import { SearchPaletteIndexStatus } from './SearchPaletteIndexStatus';
import { SearchPaletteEmptyState, SearchPaletteErrorState, SearchPaletteList, SearchPaletteLoadingState } from './SearchPaletteResults';
import { useOrderedSearchResults, useSearchResults } from './searchPaletteSearchState';
import { SearchPaletteShortcutsFooter, useSearchPaletteShortcuts } from './SearchPaletteShortcutsFooter';
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
        />
        <SearchPaletteBody
          activeIndex={activeIndex}
          searchState={searchState}
          nodesById={props.nodesById}
          onOpenResult={props.onOpenResult}
          onLoadMore={searchState.loadMore}
          onSetActiveIndex={setActiveIndex}
          query={query}
          results={results}
          selectedSpelling={searchState.selectedSpelling}
          sourceDetailsByNodeId={sourceDetailsByNodeId}
        />
        <SearchPaletteShortcutsFooter collapsed={shortcuts.collapsed} onToggle={shortcuts.toggle} />
      </div>
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

function SearchPaletteInputAndFilters(props: {
  isOpen: boolean;
  onClose: () => void;
  onCompositionChange: (value: boolean) => void;
  onQueryChange: (value: string) => void;
  onRunActive: (event: ReactKeyboardEvent<HTMLInputElement>) => void;
  onSetActiveIndex: (update: (current: number) => number) => void;
  query: string;
  searchState: ReturnType<typeof useSearchResults>;
  totalItems: number;
}) {
  const t = useTranslation();
  return (
    <>
      <FloatingPaletteInput
        inputLabel={t('desktop.search.input')}
        onClose={props.onClose}
        onCompositionChange={props.onCompositionChange}
        onQueryChange={props.onQueryChange}
        onRunActive={props.onRunActive}
        onSetActiveIndex={props.onSetActiveIndex}
        placeholder={t('desktop.search.placeholder')}
        query={props.query}
        totalItems={props.totalItems}
      />
      <SearchAliasFilters
        onSelect={props.searchState.selectSpelling}
        selectedSpelling={props.searchState.selectedSpelling}
        spellings={props.searchState.aliasSpellings}
      />
      <SearchPaletteEnhancementPrompt />
      <SearchPaletteIndexStatus isOpen={props.isOpen} />
    </>
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

function SearchPaletteBody(props: {
  activeIndex: number;
  searchState: ReturnType<typeof useSearchResults>;
  nodesById: WorkspaceListNodesById;
  onOpenResult: (result: WorkspaceSearchResult, options?: { preview?: boolean }) => void;
  onLoadMore: () => void;
  onSetActiveIndex: (value: number | ((current: number) => number)) => void;
  query: string;
  results: WorkspaceSearchResult[];
  selectedSpelling: string | null;
  sourceDetailsByNodeId: ReturnType<typeof useSearchResultSourceDetails>;
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
      onLoadMore={props.onLoadMore}
      onSetActiveIndex={props.onSetActiveIndex}
      query={props.query}
      results={props.results}
      selectedSpelling={props.selectedSpelling}
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
