import { useEffect, useMemo, useState } from 'react';

import type { WorkspaceListNodesById } from '../../features/nodes/model/workspaceListNode';
import {
  hasWorkspaceSearchRuntimeRepository,
  searchWorkspaceInRuntime
} from '../../shared/platform/appRuntimeCommandRepository';
import { appFloatingOverlayClassName, appFloatingSurfaceClassName } from '../../shared/ui';

import { FloatingPaletteInput } from './FloatingPaletteInput';
import { useExternalSectionStatus } from './searchPaletteExternalStatus';
import { SearchPaletteEmptyState, SearchPaletteErrorState, SearchPaletteList } from './SearchPaletteResults';
import { useSearchResultSourceDetails } from './searchPaletteSourceDetails';
import { useFloatingDialogFocusTrap } from './useFloatingDialogFocusTrap';
import { buildWorkspaceSearchResults, type WorkspaceSearchResult } from './workspaceSearch';

interface SearchPaletteProps {
  isOpen: boolean;
  nodeOrder: string[];
  nodesById: WorkspaceListNodesById;
  trashedNodeIds: string[];
  onClose: () => void;
  onOpenResult: (result: WorkspaceSearchResult) => void;
}

function useSearchResults(
  props: Pick<SearchPaletteProps, 'isOpen' | 'nodeOrder' | 'nodesById' | 'trashedNodeIds'>,
  query: string
) {
  const localResults = useMemo(
    () =>
      buildWorkspaceSearchResults(props.nodeOrder, props.nodesById, props.trashedNodeIds, query),
    [props.nodeOrder, props.nodesById, props.trashedNodeIds, query]
  );
  const [runtimeResults, setRuntimeResults] = useState<WorkspaceSearchResult[]>([]);
  const [runtimeError, setRuntimeError] = useState(false);

  useEffect(() => {
    if (!props.isOpen || !hasWorkspaceSearchRuntimeRepository() || !query.trim()) {
      setRuntimeResults([]);
      setRuntimeError(false);
      return;
    }

    let cancelled = false;
    setRuntimeResults([]);
    setRuntimeError(false);
    void searchWorkspaceInRuntime(query)
      .then((results) => {
        if (!cancelled) {
          setRuntimeResults(results);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setRuntimeError(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [props.isOpen, query]);

  const hasRuntime = hasWorkspaceSearchRuntimeRepository();
  return { error: hasRuntime ? runtimeError : false, results: hasRuntime ? runtimeResults : localResults };
}

function useOrderedSearchResults(
  results: WorkspaceSearchResult[],
  nodesById: WorkspaceListNodesById
) {
  return useMemo(() => {
    const externalResults: WorkspaceSearchResult[] = [];
    const regularResults: WorkspaceSearchResult[] = [];
    const anchoredResults: WorkspaceSearchResult[] = [];
    results.forEach((result) => {
      if (result.kind === 'external') {
        externalResults.push(result);
        return;
      }
      if (nodesById[result.id]?.anchorLink?.kind) {
        anchoredResults.push(result);
        return;
      }
      regularResults.push(result);
    });
    return [...regularResults, ...anchoredResults, ...externalResults];
  }, [nodesById, results]);
}

export function SearchPalette(props: SearchPaletteProps) {
  const focusTrap = useFloatingDialogFocusTrap();
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const searchState = useSearchResults(props, query);
  const results = useOrderedSearchResults(searchState.results, props.nodesById);
  const externalSectionStatus = useExternalSectionStatus(props.isOpen);
  const sourceDetailsByNodeId = useSearchResultSourceDetails(results);
  useSearchPaletteLifecycle(props.isOpen, activeIndex, results.length, setActiveIndex, setQuery);

  if (!props.isOpen) {
    return null;
  }

  const openActiveNode = () => {
    const result = results[activeIndex];
    if (result) {
      props.onOpenResult(result);
    }
  };

  return (
    <div
      aria-label="Workspace search"
      aria-modal="true"
      className={appFloatingOverlayClassName()}
      onClick={props.onClose}
      role="dialog"
    >
      <div
        className={appFloatingSurfaceClassName('panel', 'w-full max-w-2xl overflow-hidden')}
        onKeyDown={focusTrap.handleKeyDown}
        onClick={(event) => event.stopPropagation()}
        ref={focusTrap.containerRef}
      >
        <FloatingPaletteInput
          inputLabel="Search workspace"
          onClose={props.onClose}
          onQueryChange={setQuery}
          onRunActive={openActiveNode}
          onSetActiveIndex={setActiveIndex}
          placeholder="Search titles and content..."
          query={query}
          totalItems={results.length}
        />
        <SearchPaletteBody
          activeIndex={activeIndex}
          externalSectionStatus={externalSectionStatus}
          hasError={searchState.error}
          nodesById={props.nodesById}
          onOpenResult={props.onOpenResult}
          query={query}
          results={results}
          sourceDetailsByNodeId={sourceDetailsByNodeId}
        />
      </div>
    </div>
  );
}

function SearchPaletteBody(props: {
  activeIndex: number;
  externalSectionStatus: string | null;
  hasError: boolean;
  nodesById: WorkspaceListNodesById;
  onOpenResult: (result: WorkspaceSearchResult) => void;
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
      externalSectionStatus={props.externalSectionStatus}
      nodesById={props.nodesById}
      onOpenResult={props.onOpenResult}
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
  setQuery: (value: string) => void
) {
  useEffect(() => {
    if (!isOpen) {
      setQuery('');
      setActiveIndex(0);
    }
  }, [isOpen, setActiveIndex, setQuery]);

  useEffect(() => {
    if (!resultCount) {
      setActiveIndex(0);
      return;
    }
    if (activeIndex >= resultCount) setActiveIndex(resultCount - 1);
  }, [activeIndex, resultCount, setActiveIndex]);
}
