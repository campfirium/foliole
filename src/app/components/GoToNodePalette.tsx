import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type RefObject } from 'react';

import type { Node } from '../../features/nodes/model/nodeTypes';
import { appFloatingSurfaceClassName } from '../../shared/ui';

import { buildNodeSearchResults } from './workspaceNodeSearch';

interface GoToNodePaletteProps {
  isOpen: boolean;
  nodeOrder: string[];
  nodesById: Record<string, Node | undefined>;
  onClose: () => void;
  onOpenNode: (nodeId: string) => void;
  trashedNodeIds: string[];
}

interface GoToNodeInputProps {
  inputRef: RefObject<HTMLInputElement>;
  onClose: () => void;
  onOpenActive: () => void;
  onSetActiveIndex: (update: (current: number) => number) => void;
  onSetQuery: (value: string) => void;
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

export function GoToNodePalette({
  isOpen,
  nodeOrder,
  nodesById,
  onClose,
  onOpenNode,
  trashedNodeIds
}: GoToNodePaletteProps) {
  const { activeIndex, inputRef, query, results, setActiveIndex, setQuery } = useGoToNodePaletteState({
    isOpen,
    nodeOrder,
    nodesById,
    trashedNodeIds
  });

  if (!isOpen) {
    return null;
  }

  const openActiveNode = () => {
    const result = results[activeIndex];
    if (result) {
      onOpenNode(result.id);
    }
  };

  return (
    <div
      aria-label="Go to node"
      className="fixed inset-0 z-50 flex items-start justify-center bg-foreground/20 px-4 pt-[12vh]"
      onClick={onClose}
      role="dialog"
    >
      <div
        className={appFloatingSurfaceClassName('panel', 'w-full max-w-2xl overflow-hidden')}
        onClick={(event) => event.stopPropagation()}
      >
        <GoToNodeInput
          inputRef={inputRef}
          onClose={onClose}
          onOpenActive={openActiveNode}
          onSetActiveIndex={setActiveIndex}
          onSetQuery={setQuery}
          query={query}
          totalItems={results.length}
        />
        <GoToNodeResults activeIndex={activeIndex} onOpenNode={onOpenNode} query={query} results={results} />
      </div>
    </div>
  );
}

function useGoToNodePaletteState(args: Pick<GoToNodePaletteProps, 'isOpen' | 'nodeOrder' | 'nodesById' | 'trashedNodeIds'>) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const results = useMemo(
    () => buildNodeSearchResults(args.nodeOrder, args.nodesById, args.trashedNodeIds, query),
    [args.nodeOrder, args.nodesById, args.trashedNodeIds, query]
  );

  useEffect(() => {
    if (!args.isOpen) {
      setQuery('');
      setActiveIndex(0);
      return;
    }
    inputRef.current?.focus();
  }, [args.isOpen]);

  useEffect(() => {
    if (!results.length) {
      setActiveIndex(0);
      return;
    }
    if (activeIndex >= results.length) {
      setActiveIndex(results.length - 1);
    }
  }, [activeIndex, results]);

  return { activeIndex, inputRef, query, results, setActiveIndex, setQuery };
}

function GoToNodeInput({
  inputRef,
  onClose,
  onOpenActive,
  onSetActiveIndex,
  onSetQuery,
  query,
  totalItems
}: GoToNodeInputProps) {
  return (
    <input
      aria-label="Go to node"
      className="w-full border-b border-border bg-bg-elevated px-4 py-3 text-sm outline-none"
      onChange={(event) => onSetQuery(event.target.value)}
      onKeyDown={(event) => handleInputKeyDown(event, totalItems, onClose, onOpenActive, onSetActiveIndex)}
      placeholder="Type a node title..."
      ref={inputRef}
      type="text"
      value={query}
    />
  );
}

function GoToNodeResults({
  activeIndex,
  onOpenNode,
  query,
  results
}: {
  activeIndex: number;
  onOpenNode: (nodeId: string) => void;
  query: string;
  results: ReturnType<typeof buildNodeSearchResults>;
}) {
  if (!results.length) {
    return (
      <ul className="app-scrollbar max-h-[50vh] overflow-y-auto p-1">
        <li className="px-3 py-8 text-center text-sm text-foreground/55">
          {query.trim() ? 'No matching nodes' : 'Search node titles'}
        </li>
      </ul>
    );
  }

  return (
    <ul aria-label="Node search results" className="app-scrollbar max-h-[50vh] overflow-y-auto p-1">
      {results.map((item, index) => (
        <li key={item.id}>
          <button
            className="flex w-full flex-col gap-1 rounded-md px-3 py-2 text-left hover:bg-bg-subtle data-[active=true]:bg-bg-subtle"
            data-active={index === activeIndex}
            onClick={() => onOpenNode(item.id)}
            type="button"
          >
            <span className="truncate text-sm font-medium text-foreground">{item.title}</span>
            <span className="line-clamp-1 text-xs text-foreground/60">{item.path}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
