import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';

import { NATIVE_COMMANDS } from '../../../lib/platform/nativeCommands';
import type { WorkspaceListNodesById } from '../../features/nodes/model/workspaceListNode';
import { getRuntimeInvoke } from '../../shared/platform/bridge';
import { loadRuntimeNodeSourceDetails, type RuntimeNodeSourceDetails } from '../../shared/platform/nodeSourceBridge';
import { appFloatingSurfaceClassName } from '../../shared/ui';

import { useExternalSectionStatus } from './searchPaletteExternalStatus';
import { SearchPaletteEmptyState, SearchPaletteList } from './SearchPaletteResults';
import { buildWorkspaceSearchResults, type WorkspaceSearchResult } from './workspaceSearch';

interface SearchPaletteProps {
  isOpen: boolean;
  nodeOrder: string[];
  nodesById: WorkspaceListNodesById;
  trashedNodeIds: string[];
  onClose: () => void;
  onOpenResult: (result: WorkspaceSearchResult) => void;
}

interface SearchInputProps {
  onClose: () => void;
  onOpenActive: () => void;
  onQueryChange: (value: string) => void;
  onSetActiveIndex: (update: (current: number) => number) => void;
  query: string;
  totalItems: number;
}

function handleInputKeyDown(
  event: ReactKeyboardEvent<HTMLInputElement>,
  totalItems: number,
  onClose: () => void,
  onOpenActive: () => void,
  onSetActiveIndex: (update: (current: number) => number) => void
) {
  if (event.key === 'Escape') {
    event.preventDefault();
    onClose();
    return;
  }
  if (event.key === 'ArrowDown') {
    event.preventDefault();
    onSetActiveIndex((current) => Math.min(current + 1, Math.max(0, totalItems - 1)));
    return;
  }
  if (event.key === 'ArrowUp') {
    event.preventDefault();
    onSetActiveIndex((current) => Math.max(current - 1, 0));
    return;
  }
  if (event.key === 'Enter') {
    event.preventDefault();
    onOpenActive();
  }
}

function SearchInput(props: SearchInputProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <input
      aria-label="Search workspace"
      className="w-full border-b border-border bg-bg-elevated px-4 py-3 text-sm outline-none"
      onChange={(event) => props.onQueryChange(event.target.value)}
      onKeyDown={(event) => handleInputKeyDown(event, props.totalItems, props.onClose, props.onOpenActive, props.onSetActiveIndex)}
      placeholder="Search titles and content..."
      ref={inputRef}
      type="text"
      value={props.query}
    />
  );
}

function useSearchResults(props: Pick<SearchPaletteProps, 'isOpen' | 'nodeOrder' | 'nodesById' | 'trashedNodeIds'>, query: string) {
  const localResults = useMemo(
    () => buildWorkspaceSearchResults(props.nodeOrder, props.nodesById, props.trashedNodeIds, query),
    [props.nodeOrder, props.nodesById, props.trashedNodeIds, query]
  );
  const [runtimeResults, setRuntimeResults] = useState<WorkspaceSearchResult[]>([]);

  useEffect(() => {
    const runtimeInvoke = getRuntimeInvoke();
    if (!props.isOpen || !runtimeInvoke || !query.trim()) {
      setRuntimeResults([]);
      return;
    }

    let cancelled = false;
    setRuntimeResults([]);
    void runtimeInvoke(NATIVE_COMMANDS.searchWorkspace, { query }).then((results) => {
      if (!cancelled) {
        setRuntimeResults(results);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [props.isOpen, query]);

  return getRuntimeInvoke() ? runtimeResults : localResults;
}

function useSearchResultSourceDetails(results: WorkspaceSearchResult[]) {
  const [sourceDetailsByNodeId, setSourceDetailsByNodeId] = useState<Record<string, RuntimeNodeSourceDetails | null | undefined>>({});
  const cacheRef = useRef<Record<string, RuntimeNodeSourceDetails | null>>({});

  useEffect(() => {
    const nodeIds = [...new Set(results.filter((result) => result.kind !== 'external').map((result) => result.id).filter(Boolean))];
    if (nodeIds.length === 0) {
      setSourceDetailsByNodeId({});
      return;
    }

    setSourceDetailsByNodeId((current) => {
      const nextEntries = Object.fromEntries(nodeIds.map((nodeId) => [nodeId, cacheRef.current[nodeId]]));
      const currentKeys = Object.keys(current);
      if (currentKeys.length === nodeIds.length && nodeIds.every((nodeId) => current[nodeId] === nextEntries[nodeId])) {
        return current;
      }
      return nextEntries;
    });

    const missingNodeIds = nodeIds.filter((nodeId) => !Object.prototype.hasOwnProperty.call(cacheRef.current, nodeId));
    if (missingNodeIds.length === 0) {
      return;
    }

    let cancelled = false;
    missingNodeIds.forEach((nodeId) => {
      void loadRuntimeNodeSourceDetails(nodeId).then((details) => {
        if (cancelled) {
          return;
        }
        cacheRef.current[nodeId] = details;
        setSourceDetailsByNodeId((current) => (current[nodeId] === details ? current : { ...current, [nodeId]: details }));
      });
    });

    return () => {
      cancelled = true;
    };
  }, [results]);

  return sourceDetailsByNodeId;
}

function useOrderedSearchResults(results: WorkspaceSearchResult[], nodesById: WorkspaceListNodesById) {
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
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const rawResults = useSearchResults(props, query);
  const results = useOrderedSearchResults(rawResults, props.nodesById);
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
    <div aria-label="Workspace search" className="fixed inset-0 z-50 flex items-start justify-center bg-foreground/20 px-4 pt-[12vh]" onClick={props.onClose} role="dialog">
      <div className={appFloatingSurfaceClassName('panel', 'w-full max-w-2xl overflow-hidden')} onClick={(event) => event.stopPropagation()}>
        <SearchInput
          onClose={props.onClose}
          onOpenActive={openActiveNode}
          onQueryChange={setQuery}
          onSetActiveIndex={setActiveIndex}
          query={query}
          totalItems={results.length}
        />
        {results.length ? (
          <SearchPaletteList
            activeIndex={activeIndex}
            nodesById={props.nodesById}
            onOpenResult={props.onOpenResult}
            query={query}
            externalSectionStatus={externalSectionStatus}
            results={results}
            sourceDetailsByNodeId={sourceDetailsByNodeId}
          />
        ) : (
          <SearchPaletteEmptyState query={query} />
        )}
      </div>
    </div>
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
