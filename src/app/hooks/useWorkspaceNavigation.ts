import type { MutableRefObject } from 'react';

import type { EditorAdapter, EditorSelection } from '../../features/editor/adapters/EditorAdapter';
import { getTextAnchorLocators, isPdfAnchorLocator, type Node, type NodeAnchorLink } from '../../features/nodes/model/nodeTypes';
import { definedProps } from '../../shared/lib/definedProps';
import type { NodeNavigationResult } from '../../store/workspaceNavigation';
import type { NodeViewState } from '../../store/workspaceStore';

import { usePreparedNavigationHandlers } from './useWorkspaceNavigationPrefetch';
import { usePendingAnchorNavigation } from './useWorkspacePendingAnchorNavigation';

interface WorkspaceNavigationDependencies {
  activeNodeContent: string | null;
  activeNodeId: string | null;
  activeNodeParentId: string | null;
  applyNavigationReadingPosition?: (result: NodeNavigationResult | null) => boolean;
  backStackSize: number;
  beginAnchorNavigationRestore?: (nodeId: string, selection: EditorSelection) => void;
  closeContextMenu: () => void;
  completeAnchorNavigationRestore?: (nodeId: string, reason: string) => void;
  editorRef: MutableRefObject<EditorAdapter | null>;
  flushActiveEditorTransaction?: (sourceNodeId?: string | null) => boolean;
  flushPendingEditorDraft: () => void;
  flushPendingEditorDraftImmediately: () => Promise<boolean>;
  forwardStackSize: number;
  goBack: () => NodeNavigationResult | null;
  goForward: () => NodeNavigationResult | null;
  goToParent: () => NodeNavigationResult | null;
  jumpToAncestorNode: (nodeId: string) => NodeNavigationResult | null;
  nodesById: Record<string, Node>;
  nodeViewById?: Record<string, NodeViewState | undefined>;
  openNode: (nodeId: string) => NodeNavigationResult | null;
  saveActiveNodeView: (nodeIdOverride?: string | null) => void;
}

interface WorkspaceNavigationHandlers {
  canGoBack: boolean;
  canGoForward: boolean;
  canGoParent: boolean;
  handleGoBack: () => void;
  handleGoForward: () => void;
  handleGoParent: () => void;
  handleSelectBreadcrumbNode: (nodeId: string) => void;
  handleSelectNode: (nodeId: string, focusAnchor?: NodeAnchorLink | null) => void;
  shouldSuppressSelectionRestore: () => boolean;
}

function createNavigationReadingPositionCompat(args: {
  applyNavigationReadingPosition?: (result: NodeNavigationResult | null) => boolean;
  beginAnchorNavigationRestore?: (nodeId: string, selection: EditorSelection) => void;
  completeAnchorNavigationRestore?: (nodeId: string, reason: string) => void;
}) {
  return (result: NodeNavigationResult | null) => {
    if (args.applyNavigationReadingPosition) {
      return args.applyNavigationReadingPosition(result);
    }
    if (!result?.focusAnchor || isPdfAnchorLocator(result.focusAnchor.locator)) {
      return false;
    }
    const firstLocator = getTextAnchorLocators(result.focusAnchor.locator)[0];
    if (!firstLocator) {
      return false;
    }
    args.beginAnchorNavigationRestore?.(result.nodeId, {
      from: Math.max(0, firstLocator.from),
      to: Math.max(0, firstLocator.from)
    });
    void args.completeAnchorNavigationRestore;
    return true;
  };
}

export function useWorkspaceNavigation({
  activeNodeContent,
  activeNodeId,
  activeNodeParentId,
  applyNavigationReadingPosition,
  backStackSize,
  beginAnchorNavigationRestore,
  closeContextMenu,
  completeAnchorNavigationRestore,
  editorRef,
  flushPendingEditorDraft,
  flushActiveEditorTransaction = () => false,
  flushPendingEditorDraftImmediately,
  forwardStackSize,
  goBack,
  goForward,
  goToParent,
  jumpToAncestorNode,
  nodesById,
  nodeViewById,
  openNode,
  saveActiveNodeView
}: WorkspaceNavigationDependencies): WorkspaceNavigationHandlers {
  const applyNavigationReadingPositionCompat = createNavigationReadingPositionCompat({
    ...definedProps({
      applyNavigationReadingPosition,
      beginAnchorNavigationRestore,
      completeAnchorNavigationRestore
    })
  });
  const pendingAnchorNavigation = usePendingAnchorNavigation({
    activeNodeContent,
    activeNodeId,
    applyNavigationReadingPosition: applyNavigationReadingPositionCompat,
    nodeViewById: nodeViewById ?? {}
  });
  const preparedHandlers = usePreparedNavigationHandlers({
    activeNodeContent,
    activeNodeId,
    applyNavigationResult: pendingAnchorNavigation.applyNavigationResult,
    closeContextMenu,
    editorRef,
    flushActiveEditorTransaction,
    flushPendingEditorDraft,
    flushPendingEditorDraftImmediately,
    goBack,
    goForward,
    goToParent,
    jumpToAncestorNode,
    nodesById,
    openNode,
    saveActiveNodeView
  });

  return {
    canGoBack: backStackSize > 0, canGoForward: forwardStackSize > 0, canGoParent: Boolean(activeNodeParentId),
    shouldSuppressSelectionRestore: pendingAnchorNavigation.shouldSuppressSelectionRestore,
    ...preparedHandlers
  };
}
