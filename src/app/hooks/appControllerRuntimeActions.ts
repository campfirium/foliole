import type { EditorSelection } from '../../features/editor/adapters/EditorAdapter';
import { findAnchorSelection } from '../../features/editor/model/anchorNavigation';
import type { Node } from '../../features/nodes/model/nodeTypes';
import { requestPdfAnchorJump } from '../../features/pdf/model/pdfSystemBridge';

import type { BuildControllerLayoutPropsArgs } from './appControllerLayoutProps';

function updateReadingPosition(
  args: BuildControllerLayoutPropsArgs,
  selection: EditorSelection
) {
  args.runtime.readingPositionRef.current = {
    nodeId: args.ws.activeNodeId,
    selection
  };
}

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
    if (!adapter && anchor.kind === 'highlight' && anchor.locator) {
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
    args.runtime.readingPositionSyncRef.current = {
      nodeId: args.ws.activeNodeId,
      state: {
        reason: 'reveal-anchor',
        startedAt: Date.now(),
        targetSelection: selection
      }
    };
    adapter.revealSelection(selection);
    updateReadingPosition(args, selection);
    args.ws.setNodeViewState(args.ws.activeNodeId, {
      scrollTop: adapter.getScrollTop(),
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
      args.runtime.readingPositionSyncRef.current = {
        nodeId: args.ws.activeNodeId,
        state: {
          reason: 'reveal-selection',
          startedAt: Date.now(),
          targetSelection: selection
        }
      };
      adapter.revealSelection(selection);
    }
    updateReadingPosition(args, selection);

    const existingViewState = args.ws.nodeViewById[args.ws.activeNodeId];
    args.ws.setNodeViewState(args.ws.activeNodeId, {
      scrollTop: adapter?.getScrollTop() ?? existingViewState?.scrollTop ?? 0,
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
    if (adapter) {
      args.runtime.readingPositionSyncRef.current = {
        nodeId: args.ws.activeNodeId,
        state: {
          reason: 'reveal-position',
          startedAt: Date.now(),
          targetSelection: { from: position, to: position }
        }
      };
      adapter.revealPosition(position);
    }
    updateReadingPosition(args, {
      from: position,
      to: position
    });

    const existingViewState = args.ws.nodeViewById[args.ws.activeNodeId];
    args.ws.setNodeViewState(args.ws.activeNodeId, {
      scrollTop: adapter?.getScrollTop() ?? existingViewState?.scrollTop ?? 0,
      selection: {
        from: position,
        to: position
      }
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
