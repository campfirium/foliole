import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';

import { NATIVE_COMMANDS } from '../../../lib/platform/nativeCommands';
import type { WorkspaceListNodesById } from '../../features/nodes/model/workspaceListNode';
import { getRuntimeInvoke } from '../../shared/platform/bridge';
import { loadRuntimeNodeSourceDetails, type RuntimeNodeSourceDetails } from '../../shared/platform/nodeSourceBridge';
import { appFloatingSurfaceClassName } from '../../shared/ui';

import {
  renderSearchResultMetaBadge,
  renderSearchResultSourceLabel,
  renderSearchResultText,
  resolveSearchResultContext,
  resolveSearchResultNodeBadge,
  resolveSearchResultPathLabel
} from './searchPaletteResultPresentation';
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

function SearchPaletteEmptyState({ query }: { query: string }) {
  const label = query.trim() ? 'No matching notes' : 'Search across note titles and content';
  return (
    <ul className="app-scrollbar max-h-[50vh] overflow-y-auto p-1">
      <li className="px-3 py-8 text-center text-sm text-foreground/55">{label}</li>
    </ul>
  );
}

function SearchPaletteList(props: {
  activeIndex: number;
  nodesById: WorkspaceListNodesById;
  onOpenResult: (result: WorkspaceSearchResult) => void;
  query: string;
  results: WorkspaceSearchResult[];
  sourceDetailsByNodeId: Record<string, RuntimeNodeSourceDetails | null | undefined>;
}) {
  if (!props.results.length) {
    return null;
  }

  return (
    <ul aria-label="Workspace search results" className="app-scrollbar max-h-[50vh] overflow-y-auto p-1">
      {props.results.map((item, index) => (
        <li key={`${item.id}-${item.kind}-${index}`}>
          <button
            className="flex w-full flex-col gap-1 rounded-md px-3 py-2 text-left hover:bg-bg-subtle data-[active=true]:bg-bg-subtle"
            data-active={index === props.activeIndex}
            onClick={() => props.onOpenResult(item)}
            type="button"
          >
            <span className="min-w-0 truncate text-sm font-medium text-foreground">{renderSearchResultText(item.title, props.query)}</span>
            <span className="line-clamp-2 text-xs text-foreground/60">
              {renderSearchResultText(resolveSearchResultContext(item), props.query)}
            </span>
            <span className="flex items-center justify-between gap-3 text-[11px] text-foreground/45">
              <span className="min-w-0 truncate">{resolveSearchResultPathLabel(item, props.nodesById)}</span>
              <span className="flex shrink-0 items-center gap-1">
                {renderSearchResultMetaBadge(resolveSearchResultNodeBadge(item, props.nodesById))}
                {renderSearchResultSourceLabel(props.sourceDetailsByNodeId[item.id])}
              </span>
            </span>
          </button>
        </li>
      ))}
    </ul>
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
    const nodeIds = [...new Set(results.map((result) => result.id).filter(Boolean))];
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
    const regularResults: WorkspaceSearchResult[] = [];
    const anchoredResults: WorkspaceSearchResult[] = [];
    results.forEach((result) => {
      if (nodesById[result.id]?.anchorLink?.kind) {
        anchoredResults.push(result);
        return;
      }
      regularResults.push(result);
    });
    return [...regularResults, ...anchoredResults];
  }, [nodesById, results]);
}

export function SearchPalette(props: SearchPaletteProps) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const rawResults = useSearchResults(props, query);
  const results = useOrderedSearchResults(rawResults, props.nodesById);
  const sourceDetailsByNodeId = useSearchResultSourceDetails(results);

  useEffect(() => {
    if (!props.isOpen) {
      setQuery('');
      setActiveIndex(0);
    }
  }, [props.isOpen]);

  useEffect(() => {
    if (!results.length) {
      setActiveIndex(0);
      return;
    }
    if (activeIndex >= results.length) {
      setActiveIndex(results.length - 1);
    }
  }, [activeIndex, results]);

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
