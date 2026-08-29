import type { MutableRefObject } from 'react';

import type { EditorAdapter, EditorSelection } from '../../features/editor/adapters/EditorAdapter';
import { getTextAnchorLocators, isPdfAnchorLocator, type Node, type NodeAnchorLink } from '../../features/nodes/model/nodeTypes';
import { definedProps } from '../../shared/lib/definedProps';
import type { WorkspaceBrowseRootIntent } from '../../store/workspaceBrowseRoot';
import type { NodeNavigationResult } from '../../store/workspaceNavigation';
import {
  resolveBackNavigationTarget,
  resolveLastChildNavigationTarget,
  resolveForwardNavigationTarget,
  resolveParentNavigationTarget
} from '../../store/workspaceNavigationTargets';
import { useWorkspaceStore, type NodeViewState } from '../../store/workspaceStore';

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
  goToLastChild?: () => NodeNavigationResult | null;
  goToParent: () => NodeNavigationResult | null;
  jumpToAncestorNode: (nodeId: string) => NodeNavigationResult | null;
  nodesById: Record<string, Node>;
  nodeViewById?: Record<string, NodeViewState | undefined>;
  openNode: (nodeId: string, browseRootIntent?: WorkspaceBrowseRootIntent) => NodeNavigationResult | null;
  saveActiveNodeView: (nodeIdOverride?: string | null) => void;
}

interface WorkspaceNavigationHandlers {
  canGoBack: boolean;
  canGoForward: boolean;
  canGoParent: boolean;
  canGoToLastChild: boolean;
  handleGoBack: () => void;
  handleGoForward: () => void;
  handleGoParent: () => void;
  handleGoToLastChild: () => void;
  handleSelectBreadcrumbNode: (nodeId: string) => void;
  handleSelectNode: (
    nodeId: string,
    focusAnchor?: NodeAnchorLink | null,
    browseRootIntent?: WorkspaceBrowseRootIntent
  ) => void;
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

export function useWorkspaceNavigation(args: WorkspaceNavigationDependencies): WorkspaceNavigationHandlers {
  const applyNavigationReadingPositionCompat = createNavigationReadingPositionCompat({
    ...definedProps({
      applyNavigationReadingPosition: args.applyNavigationReadingPosition,
      beginAnchorNavigationRestore: args.beginAnchorNavigationRestore,
      completeAnchorNavigationRestore: args.completeAnchorNavigationRestore
    })
  });
  const pendingAnchorNavigation = usePendingAnchorNavigation({
    activeNodeContent: args.activeNodeContent,
    activeNodeId: args.activeNodeId,
    applyNavigationReadingPosition: applyNavigationReadingPositionCompat,
    nodeViewById: args.nodeViewById ?? {}
  });
  const preparedHandlers = usePreparedNavigationHandlers({
    activeNodeContent: args.activeNodeContent,
    activeNodeId: args.activeNodeId,
    applyNavigationResult: pendingAnchorNavigation.applyNavigationResult,
    closeContextMenu: args.closeContextMenu,
    editorRef: args.editorRef,
    flushActiveEditorTransaction: args.flushActiveEditorTransaction ?? (() => false),
    flushPendingEditorDraft: args.flushPendingEditorDraft,
    flushPendingEditorDraftImmediately: args.flushPendingEditorDraftImmediately,
    goBack: args.goBack,
    goForward: args.goForward,
    goToLastChild: args.goToLastChild ?? (() => null),
    goToParent: args.goToParent,
    jumpToAncestorNode: args.jumpToAncestorNode,
    nodesById: args.nodesById,
    openNode: args.openNode,
    saveActiveNodeView: args.saveActiveNodeView
  });

  const targetSource = useWorkspaceStore.getState();
  return {
    canGoBack: args.backStackSize > 0 && Boolean(resolveBackNavigationTarget(targetSource).nodeId),
    canGoForward: args.forwardStackSize > 0 && Boolean(resolveForwardNavigationTarget(targetSource).nodeId),
    canGoParent: Boolean(args.activeNodeParentId) && Boolean(resolveParentNavigationTarget(targetSource)),
    canGoToLastChild: Boolean(resolveLastChildNavigationTarget(targetSource)),
    shouldSuppressSelectionRestore: pendingAnchorNavigation.shouldSuppressSelectionRestore,
    ...preparedHandlers
  };
}
