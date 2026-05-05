import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';

import type { Node } from '../../features/nodes/model/nodeTypes';
import { appFloatingSurfaceClassName } from '../../shared/ui';

import { buildWorkspaceSearchResults } from './workspaceSearch';

interface SearchPaletteProps {
  isOpen: boolean;
  nodeOrder: string[];
  nodesById: Record<string, Node | undefined>;
  trashedNodeIds: string[];
  onClose: () => void;
  onOpenNode: (nodeId: string) => void;
}

interface SearchPaletteState {
  activeIndex: number;
  openActiveNode: () => void;
  query: string;
  results: ReturnType<typeof buildWorkspaceSearchResults>;
  setActiveIndex: (update: (current: number) => number) => void;
  setQuery: (value: string) => void;
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

function SearchInput({
  onClose,
  onOpenActive,
  onQueryChange,
  onSetActiveIndex,
  query,
  totalItems
}: SearchInputProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <input
      aria-label="Search workspace"
      className="w-full border-b border-border bg-bg-elevated px-4 py-3 text-sm outline-none"
      onChange={(event) => onQueryChange(event.target.value)}
      onKeyDown={(event) => handleInputKeyDown(event, totalItems, onClose, onOpenActive, onSetActiveIndex)}
      placeholder="Search titles and content..."
      ref={inputRef}
      type="text"
      value={query}
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

function SearchPaletteList({
  activeIndex,
  onOpenNode,
  results
}: {
  activeIndex: number;
  onOpenNode: (nodeId: string) => void;
  results: ReturnType<typeof buildWorkspaceSearchResults>;
}) {
  if (!results.length) {
    return null;
  }

  return (
    <ul aria-label="Workspace search results" className="app-scrollbar max-h-[50vh] overflow-y-auto p-1">
      {results.map((item, index) => (
        <li key={item.id}>
          <button
            className="flex w-full flex-col gap-1 rounded-md px-3 py-2 text-left hover:bg-bg-subtle data-[active=true]:bg-bg-subtle"
            data-active={index === activeIndex}
            onClick={() => onOpenNode(item.id)}
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

function useSearchPaletteState(props: Pick<SearchPaletteProps, 'isOpen' | 'nodeOrder' | 'nodesById' | 'onOpenNode' | 'trashedNodeIds'>): SearchPaletteState {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const results = useMemo(
    () => buildWorkspaceSearchResults(props.nodeOrder, props.nodesById, props.trashedNodeIds, query),
    [props.nodeOrder, props.nodesById, props.trashedNodeIds, query]
  );

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

  return {
    activeIndex,
    openActiveNode: () => {
      const result = results[activeIndex];
      if (result) {
        props.onOpenNode(result.id);
      }
    },
    query,
    results,
    setActiveIndex,
    setQuery
  };
}

export function SearchPalette({
  isOpen,
  nodeOrder,
  nodesById,
  onClose,
  onOpenNode,
  trashedNodeIds
}: SearchPaletteProps) {
  const state = useSearchPaletteState({ isOpen, nodeOrder, nodesById, onOpenNode, trashedNodeIds });

  if (!isOpen) {
    return null;
  }

  return (
    <div
      aria-label="Workspace search"
      className="fixed inset-0 z-50 flex items-start justify-center bg-foreground/20 px-4 pt-[12vh]"
      onClick={onClose}
      role="dialog"
    >
      <div
        className={appFloatingSurfaceClassName('panel', 'w-full max-w-2xl overflow-hidden')}
        onClick={(event) => event.stopPropagation()}
      >
        <SearchInput
          onClose={onClose}
          onOpenActive={state.openActiveNode}
          onQueryChange={state.setQuery}
          onSetActiveIndex={state.setActiveIndex}
          query={state.query}
          totalItems={state.results.length}
        />
        {state.results.length ? (
          <SearchPaletteList activeIndex={state.activeIndex} onOpenNode={onOpenNode} results={state.results} />
        ) : (
          <SearchPaletteEmptyState query={state.query} />
        )}
      </div>
    </div>
  );
}
