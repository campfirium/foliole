import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type RefObject } from 'react';

import type { WorkspaceListNode } from '../../features/nodes/model/workspaceListNode';
import { appFloatingSurfaceClassName } from '../../shared/ui';

import { buildNodeSearchResults } from './workspaceNodeSearch';

interface GoToNodePaletteProps {
  dialogLabel?: string;
  emptyLabel?: string;
  isOpen: boolean;
  inputLabel?: string;
  nodeOrder: string[];
  nodesById: Record<string, WorkspaceListNode | undefined>;
  onClose: () => void;
  onOpenNode?: (nodeId: string) => void;
  onSelectNode?: (nodeId: string) => void;
  noResultsLabel?: string;
  placeholder?: string;
  recentNodeIds: string[];
  trashedNodeIds: string[];
}

interface GoToNodeInputProps {
  inputRef: RefObject<HTMLInputElement>;
  inputLabel: string;
  onClose: () => void;
  onOpenActive: () => void;
  onSetActiveIndex: (update: (current: number) => number) => void;
  onSetQuery: (value: string) => void;
  placeholder: string;
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
  dialogLabel = 'Go to node',
  emptyLabel = 'Search node titles',
  isOpen,
  inputLabel = 'Go to node',
  nodeOrder,
  nodesById,
  onClose,
  onOpenNode,
  onSelectNode,
  noResultsLabel = 'No matching nodes',
  placeholder = 'Type a node title...',
  recentNodeIds,
  trashedNodeIds
}: GoToNodePaletteProps) {
  const handleSelectNode = onSelectNode ?? onOpenNode;
  const { activeIndex, inputRef, query, results, setActiveIndex, setQuery } = useGoToNodePaletteState({
    isOpen,
    nodeOrder,
    nodesById,
    recentNodeIds,
    trashedNodeIds
  });

  if (!isOpen) {
    return null;
  }

  const openActiveNode = () => {
    const result = results[activeIndex];
    if (result && handleSelectNode) {
      handleSelectNode(result.id);
    }
  };

  return renderGoToNodeDialog({
    activeIndex,
    dialogLabel,
    emptyLabel,
    handleSelectNode,
    inputLabel,
    inputRef,
    noResultsLabel,
    onClose,
    openActiveNode,
    placeholder,
    query,
    results,
    setActiveIndex,
    setQuery
  });
}

function renderGoToNodeDialog(args: {
  activeIndex: number;
  dialogLabel: string;
  emptyLabel: string;
  handleSelectNode?: (nodeId: string) => void;
  inputLabel: string;
  inputRef: RefObject<HTMLInputElement>;
  noResultsLabel: string;
  onClose: () => void;
  openActiveNode: () => void;
  placeholder: string;
  query: string;
  results: ReturnType<typeof buildNodeSearchResults>;
  setActiveIndex: (update: (current: number) => number) => void;
  setQuery: (value: string) => void;
}) {
  return (
    <div
      aria-label={args.dialogLabel}
      className="fixed inset-0 z-50 flex items-start justify-center bg-foreground/20 px-4 pt-[12vh]"
      onClick={args.onClose}
      role="dialog"
    >
      <div
        className={appFloatingSurfaceClassName('panel', 'w-full max-w-2xl overflow-hidden')}
        onClick={(event) => event.stopPropagation()}
      >
        <GoToNodeInput
          inputRef={args.inputRef}
          inputLabel={args.inputLabel}
          onClose={args.onClose}
          onOpenActive={args.openActiveNode}
          onSetActiveIndex={args.setActiveIndex}
          onSetQuery={args.setQuery}
          placeholder={args.placeholder}
          query={args.query}
          totalItems={args.results.length}
        />
        <GoToNodeResults
          activeIndex={args.activeIndex}
          emptyLabel={args.emptyLabel}
          noResultsLabel={args.noResultsLabel}
          onSelectNode={args.handleSelectNode ?? (() => undefined)}
          query={args.query}
          results={args.results}
        />
      </div>
    </div>
  );
}

function useGoToNodePaletteState(args: Pick<GoToNodePaletteProps, 'isOpen' | 'nodeOrder' | 'nodesById' | 'recentNodeIds' | 'trashedNodeIds'>) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const results = useMemo(
    () => buildNodeSearchResults(args.nodeOrder, args.nodesById, args.recentNodeIds, args.trashedNodeIds, query),
    [args.nodeOrder, args.nodesById, args.recentNodeIds, args.trashedNodeIds, query]
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
  inputLabel,
  onClose,
  onOpenActive,
  onSetActiveIndex,
  onSetQuery,
  placeholder,
  query,
  totalItems
}: GoToNodeInputProps) {
  return (
    <input
      aria-label={inputLabel}
      className="w-full border-b border-border bg-bg-elevated px-4 py-3 text-sm outline-none"
      onChange={(event) => onSetQuery(event.target.value)}
      onKeyDown={(event) => handleInputKeyDown(event, totalItems, onClose, onOpenActive, onSetActiveIndex)}
      placeholder={placeholder}
      ref={inputRef}
      type="text"
      value={query}
    />
  );
}

function GoToNodeResults({
  activeIndex,
  emptyLabel,
  noResultsLabel,
  onSelectNode,
  query,
  results
}: {
  activeIndex: number;
  emptyLabel: string;
  noResultsLabel: string;
  onSelectNode: (nodeId: string) => void;
  query: string;
  results: ReturnType<typeof buildNodeSearchResults>;
}) {
  if (!results.length) {
    return (
      <ul className="app-scrollbar max-h-[50vh] overflow-y-auto p-1">
        <li className="px-3 py-8 text-center text-sm text-foreground/55">
          {query.trim() ? noResultsLabel : emptyLabel}
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
            onClick={() => onSelectNode(item.id)}
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
