import type { EditorSelection } from '../../features/editor/adapters/EditorAdapter';
import { findAnchorSelection } from '../../features/editor/model/anchorNavigation';
import type { Node } from '../../features/nodes/model/nodeTypes';

import type { BuildControllerLayoutPropsArgs } from './appControllerLayoutProps';

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
    if (!activeNode || !adapter) {
      return;
    }
    const selection = findAnchorSelection(activeNode.content, anchor);
    if (!selection) {
      return;
    }
    adapter.revealSelection(selection);
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
      adapter.revealSelection(selection);
    }

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
      adapter.revealPosition(position);
    }

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

export function createResolveDocumentPositionAtViewportY(args: BuildControllerLayoutPropsArgs) {
  return (clientY: number) => {
    if (args.runtime.isViewingTrashNode || !args.ws.activeNodeId) {
      return null;
    }
    return args.runtime.editorRef.current?.getDocumentPositionAtViewportY(clientY) ?? null;
  };
}
