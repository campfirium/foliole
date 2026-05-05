import { useEffect, useMemo, useState } from 'react';

import type { WorkspaceListNode } from '../../features/nodes/model/workspaceListNode';
import {
  appFloatingEmptyStateClassName,
  appFloatingItemClassName,
  appFloatingListClassName,
  appFloatingOverlayClassName,
  appFloatingSurfaceClassName
} from '../../shared/ui';

import { FloatingPaletteInput } from './FloatingPaletteInput';
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

export function GoToNodePalette({
  dialogLabel = 'Go to',
  emptyLabel = 'Search folders, topics, and items',
  isOpen,
  inputLabel = 'Go to',
  nodeOrder,
  nodesById,
  onClose,
  onOpenNode,
  onSelectNode,
  noResultsLabel = 'No matching results',
  placeholder = 'Type a title...',
  recentNodeIds,
  trashedNodeIds
}: GoToNodePaletteProps) {
  const handleSelectNode = onSelectNode ?? onOpenNode;
  const { activeIndex, query, results, setActiveIndex, setQuery } = useGoToNodePaletteState({
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
      className={appFloatingOverlayClassName()}
      onClick={args.onClose}
      role="dialog"
    >
      <div
        className={appFloatingSurfaceClassName('panel', 'w-full max-w-2xl overflow-hidden')}
        onClick={(event) => event.stopPropagation()}
      >
        <FloatingPaletteInput
          inputLabel={args.inputLabel}
          onClose={args.onClose}
          onQueryChange={args.setQuery}
          onRunActive={args.openActiveNode}
          onSetActiveIndex={args.setActiveIndex}
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

function useGoToNodePaletteState(
  args: Pick<
    GoToNodePaletteProps,
    'isOpen' | 'nodeOrder' | 'nodesById' | 'recentNodeIds' | 'trashedNodeIds'
  >
) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const results = useMemo(
    () =>
      buildNodeSearchResults(
        args.nodeOrder,
        args.nodesById,
        args.recentNodeIds,
        args.trashedNodeIds,
        query
      ),
    [args.nodeOrder, args.nodesById, args.recentNodeIds, args.trashedNodeIds, query]
  );

  useEffect(() => {
    if (!args.isOpen) {
      setQuery('');
      setActiveIndex(0);
      return;
    }
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

  return { activeIndex, query, results, setActiveIndex, setQuery };
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
      <ul className={appFloatingListClassName()}>
        <li className={appFloatingEmptyStateClassName()}>
          {query.trim() ? noResultsLabel : emptyLabel}
        </li>
      </ul>
    );
  }

  return (
    <ul aria-label="Search results" className={appFloatingListClassName()}>
      {results.map((item, index) => (
        <li key={item.id}>
          <button
            className={appFloatingItemClassName('flex flex-col gap-1')}
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
