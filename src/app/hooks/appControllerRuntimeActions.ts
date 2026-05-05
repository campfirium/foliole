import type { EditorSelection } from '../../features/editor/adapters/EditorAdapter';
import { findAnchorSelection } from '../../features/editor/model/anchorNavigation';
import { isPdfAnchorLocator, type Node } from '../../features/nodes/model/nodeTypes';
import { requestPdfAnchorJump } from '../../features/pdf/model/pdfSystemBridge';

import type { BuildControllerLayoutPropsArgs } from './appControllerLayoutProps';
import { requestReadingPositionApply } from './readingPositionRequests';

export function createToggleListVisibility(args: BuildControllerLayoutPropsArgs) {
  return () => {
    if (args.ws.isListCollapsed) {
      args.ws.setListCollapsed(false);
      args.ws.setListWidth(Math.max(220, args.runtime.lastExpandedListWidthRef.current || args.ws.listWidth || 300));
      return;
    }
    args.runtime.lastExpandedListWidthRef.current = args.ws.listWidth;
    args.ws.setListCollapsed(true);
  };
}

export function createToggleRightSidebarVisibility(args: BuildControllerLayoutPropsArgs) {
  return () => {
    if (args.ws.isRightSidebarCollapsed) {
      args.ws.setRightSidebarCollapsed(false);
      args.ws.setRightSidebarWidth(
        Math.max(240, args.runtime.lastExpandedRightSidebarWidthRef.current || args.ws.rightSidebarWidth || 320)
      );
      return;
    }
    args.runtime.lastExpandedRightSidebarWidthRef.current = args.ws.rightSidebarWidth;
    args.ws.setRightSidebarCollapsed(true);
  };
}

export function createRevealAnchorInDocument(args: BuildControllerLayoutPropsArgs) {
  return (anchor: Node['anchorLink']) => {
    if (!anchor || args.runtime.isViewingTrashNode || !args.ws.activeNodeId) {
      return;
    }
    const activeNode = args.ws.nodesById[args.ws.activeNodeId];
    const adapter = args.runtime.editorRef.current;
    if (!activeNode) {
      return;
    }
    if (!adapter && anchor.kind === 'highlight' && isPdfAnchorLocator(anchor.locator)) {
      requestPdfAnchorJump(args.ws.activeNodeId, anchor.locator);
      return;
    }
    if (!adapter) {
      return;
    }
    const selection = findAnchorSelection(activeNode.content, anchor);
    if (!selection) {
      return;
    }
    requestReadingPositionApply({
      nodeId: args.ws.activeNodeId,
      reason: 'reveal-anchor',
      runtime: args.runtime,
      selection
    });
  };
}

export function createRevealDocumentSelection(args: BuildControllerLayoutPropsArgs) {
  return (selection: EditorSelection) => {
    if (args.runtime.isViewingTrashNode || !args.ws.activeNodeId) {
      return;
    }
    const adapter = args.runtime.editorRef.current;
    if (adapter) {
      requestReadingPositionApply({
        nodeId: args.ws.activeNodeId,
        reason: 'reveal-selection',
        runtime: args.runtime,
        selection
      });
      return;
    }
    const existingViewState = args.ws.nodeViewById[args.ws.activeNodeId];
    args.ws.setNodeViewState(args.ws.activeNodeId, {
      scrollTop: existingViewState?.scrollTop ?? 0,
      selection
    });
  };
}

export function createRevealDocumentPosition(args: BuildControllerLayoutPropsArgs) {
  return (position: number) => {
    if (args.runtime.isViewingTrashNode || !args.ws.activeNodeId) {
      return;
    }
    const adapter = args.runtime.editorRef.current;
    const selection = {
      from: position,
      to: position
    };
    if (adapter) {
      requestReadingPositionApply({
        nodeId: args.ws.activeNodeId,
        reason: 'reveal-position',
        runtime: args.runtime,
        selection
      });
      return;
    }
    const existingViewState = args.ws.nodeViewById[args.ws.activeNodeId];
    args.ws.setNodeViewState(args.ws.activeNodeId, {
      scrollTop: existingViewState?.scrollTop ?? 0,
      selection
    });
  };
}

export function createPersistPdfViewState(args: BuildControllerLayoutPropsArgs) {
  return (nodeId: string, viewState: { scrollTop: number; selection: { from: number; to: number } }) => {
    if (args.runtime.isViewingTrashNode || !nodeId) {
      return;
    }
    args.ws.setNodeViewState(nodeId, viewState);
  };
}

export function createResolveDocumentPositionAtViewportY(args: BuildControllerLayoutPropsArgs) {
  return (clientY: number) => {
    if (args.runtime.isViewingTrashNode || !args.ws.activeNodeId) {
      return null;
    }
    return args.runtime.editorRef.current?.getDocumentPositionAtViewportY(clientY) ?? null;
  };
}
