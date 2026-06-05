import { useEffect, useMemo, useState } from 'react';

import type { WorkspaceListNode } from '../../features/nodes/model/workspaceListNode';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import {
  appFloatingEmptyStateClassName,
  appFloatingItemClassName,
  appFloatingListClassName,
  appFloatingOverlayClassName,
  appFloatingSurfaceClassName
} from '../../shared/ui';

import { FloatingPaletteInput } from './FloatingPaletteInput';
import { useFloatingDialogFocusTrap } from './useFloatingDialogFocusTrap';
import { useFloatingPaletteEscape } from './useFloatingPaletteEscape';
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
  dialogLabel,
  emptyLabel,
  isOpen,
  inputLabel,
  nodeOrder,
  nodesById,
  onClose,
  onOpenNode,
  onSelectNode,
  noResultsLabel,
  placeholder,
  recentNodeIds,
  trashedNodeIds
}: GoToNodePaletteProps) {
  const t = useTranslation();
  const handleSelectNode = onSelectNode ?? onOpenNode;
  const focusTrap = useFloatingDialogFocusTrap(isOpen);
  useFloatingPaletteEscape(isOpen, onClose);
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
    dialogLabel: dialogLabel ?? t('desktop.palette.node.dialog'),
    emptyLabel: emptyLabel ?? t('desktop.palette.node.empty'),
    ...(handleSelectNode ? { handleSelectNode } : {}),
    inputLabel: inputLabel ?? t('desktop.palette.node.input'),
    noResultsLabel: noResultsLabel ?? t('desktop.palette.node.noResults'),
    onClose,
    openActiveNode,
    placeholder: placeholder ?? t('desktop.palette.node.placeholder'),
    query,
    results,
    focusTrap,
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
  focusTrap: ReturnType<typeof useFloatingDialogFocusTrap>;
  setActiveIndex: (update: (current: number) => number) => void;
  setQuery: (value: string) => void;
}) {
  return (
    <div
      aria-label={args.dialogLabel}
      aria-modal="true"
      className={appFloatingOverlayClassName()}
      onClick={args.onClose}
      role="dialog"
    >
      <div
        className={appFloatingSurfaceClassName('panel', 'w-full max-w-2xl overflow-hidden')}
        onKeyDown={args.focusTrap.handleKeyDown}
        onClick={(event) => event.stopPropagation()}
        ref={args.focusTrap.containerRef}
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
  const t = useTranslation();

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
    <ul aria-label={t('desktop.palette.node.results')} className={appFloatingListClassName()}>
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
