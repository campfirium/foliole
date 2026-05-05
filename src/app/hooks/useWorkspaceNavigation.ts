import type { MutableRefObject } from 'react';

import type { EditorAdapter, EditorSelection } from '../../features/editor/adapters/EditorAdapter';
import type { Node, NodeAnchorLink } from '../../features/nodes/model/nodeTypes';
import type { NodeNavigationResult } from '../../store/workspaceNavigation';

import { usePreparedNavigationHandlers } from './useWorkspaceNavigationPrefetch';
import { usePendingAnchorNavigation } from './useWorkspacePendingAnchorNavigation';

interface WorkspaceNavigationDependencies {
  activeNodeContent: string | null;
  activeNodeId: string | null;
  activeNodeParentId: string | null;
  backStackSize: number;
  beginAnchorNavigationRestore: (nodeId: string, selection: EditorSelection) => void;
  closeContextMenu: () => void;
  completeAnchorNavigationRestore: (nodeId: string, reason: string) => void;
  editorRef: MutableRefObject<EditorAdapter | null>;
  flushPendingEditorDraft: () => void;
  forwardStackSize: number;
  goBack: () => NodeNavigationResult | null;
  goForward: () => NodeNavigationResult | null;
  goToParent: () => NodeNavigationResult | null;
  jumpToAncestorNode: (nodeId: string) => NodeNavigationResult | null;
  nodesById: Record<string, Node>;
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

export function useWorkspaceNavigation({
  activeNodeContent,
  activeNodeId,
  activeNodeParentId,
  backStackSize,
  beginAnchorNavigationRestore,
  closeContextMenu,
  completeAnchorNavigationRestore,
  editorRef,
  flushPendingEditorDraft,
  forwardStackSize,
  goBack,
  goForward,
  goToParent,
  jumpToAncestorNode,
  nodesById,
  openNode,
  saveActiveNodeView
}: WorkspaceNavigationDependencies): WorkspaceNavigationHandlers {
  const pendingAnchorNavigation = usePendingAnchorNavigation({
    activeNodeContent,
    activeNodeId,
    beginAnchorNavigationRestore,
    completeAnchorNavigationRestore,
    editorRef
  });
  const preparedHandlers = usePreparedNavigationHandlers({
    activeNodeContent,
    activeNodeId,
    applyNavigationResult: pendingAnchorNavigation.applyNavigationResult,
    closeContextMenu,
    editorRef,
    flushPendingEditorDraft,
    goBack,
    goForward,
    goToParent,
    jumpToAncestorNode,
    nodesById,
    openNode,
    saveActiveNodeView
  });

  return {
    canGoBack: backStackSize > 0,
    canGoForward: forwardStackSize > 0,
    canGoParent: Boolean(activeNodeParentId),
    shouldSuppressSelectionRestore: pendingAnchorNavigation.shouldSuppressSelectionRestore,
    ...preparedHandlers
  };
}
