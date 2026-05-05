import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';

import { NATIVE_COMMANDS } from '../../../lib/platform/nativeCommands';
import type { WorkspaceListNodesById } from '../../features/nodes/model/workspaceListNode';
import { getRuntimeInvoke } from '../../shared/platform/bridge';
import { appFloatingSurfaceClassName } from '../../shared/ui';

import { buildWorkspaceSearchResults, type WorkspaceSearchResult } from './workspaceSearch';

interface SearchPaletteProps {
  isOpen: boolean;
  nodeOrder: string[];
  nodesById: WorkspaceListNodesById;
  trashedNodeIds: string[];
  onClose: () => void;
  onOpenNode: (nodeId: string) => void;
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

function SearchPaletteList(props: { activeIndex: number; onOpenNode: (nodeId: string) => void; results: WorkspaceSearchResult[] }) {
  if (!props.results.length) {
    return null;
  }

  return (
    <ul aria-label="Workspace search results" className="app-scrollbar max-h-[50vh] overflow-y-auto p-1">
      {props.results.map((item, index) => (
        <li key={item.id}>
          <button
            className="flex w-full flex-col gap-1 rounded-md px-3 py-2 text-left hover:bg-bg-subtle data-[active=true]:bg-bg-subtle"
            data-active={index === props.activeIndex}
            onClick={() => props.onOpenNode(item.id)}
            type="button"
          >
            <span className="truncate text-sm font-medium text-foreground">{item.title}</span>
            <span className="line-clamp-2 text-xs text-foreground/60">{item.excerpt}</span>
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

export function SearchPalette(props: SearchPaletteProps) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const results = useSearchResults(props, query);

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
      props.onOpenNode(result.id);
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
          <SearchPaletteList activeIndex={activeIndex} onOpenNode={props.onOpenNode} results={results} />
        ) : (
          <SearchPaletteEmptyState query={query} />
        )}
      </div>
    </div>
  );
}
