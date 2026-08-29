import type { EditorSelection, EditorViewportMode } from '../../features/editor/adapters/EditorAdapter';
import { findAnchorSelection } from '../../features/editor/model/anchorNavigation';
import { isPdfAnchorLocator, type Node } from '../../features/nodes/model/nodeTypes';
import { requestPdfAnchorJump } from '../../features/pdf/model/pdfSystemRegistry';
import { definedProps } from '../../shared/lib/definedProps';
import { LIST_WIDTH_DEFAULT, RIGHT_SIDEBAR_WIDTH_DEFAULT } from '../../store/workspaceLayoutDomain';
import type { NodeViewState } from '../../store/workspaceStore';

import type { BuildControllerLayoutPropsArgs } from './appControllerLayoutProps';
import { requestReadingPositionApply } from './readingPositionRequests';

function writeNodeReadingPosition(args: BuildControllerLayoutPropsArgs, selection: EditorSelection) {
  if (!args.ws.activeNodeId) {
    return;
  }
  const existingViewState = args.ws.nodeViewById[args.ws.activeNodeId];
  args.ws.setNodeViewState(args.ws.activeNodeId, {
    scrollTop: args.runtime.editorRef.current?.getScrollTop() ?? existingViewState?.scrollTop ?? 0,
    selection
  });
}

function applyReadingPositionToActiveEditor(
  args: BuildControllerLayoutPropsArgs,
  selection: EditorSelection,
  targetViewportMode?: EditorViewportMode,
  targetViewportRatio?: number
) {
  const adapter = args.runtime.editorRef.current;
  if (!adapter) {
    return;
  }
  adapter.setSelection(selection);
  if (targetViewportMode === 'center' && adapter.revealSelectionCentered) {
    adapter.revealSelectionCentered(selection);
    return;
  }
  if (targetViewportMode === 'nearest') {
    adapter.restoreSelection(selection);
    return;
  }
  if (typeof targetViewportRatio === 'number' && adapter.revealSelectionAtViewportRatio) {
    adapter.revealSelectionAtViewportRatio(selection, targetViewportRatio);
    return;
  }
  if (selection.from === selection.to) {
    adapter.revealPosition(selection.from);
    return;
  }
  adapter.revealSelection(selection);
}

export function createToggleListVisibility(args: BuildControllerLayoutPropsArgs) {
  return () => {
    if (args.ws.isListCollapsed) {
      args.ws.setListWidth(
        Math.max(LIST_WIDTH_DEFAULT, args.runtime.lastExpandedListWidthRef.current || args.ws.listWidth || LIST_WIDTH_DEFAULT)
      );
      return;
    }
    args.runtime.lastExpandedListWidthRef.current = args.ws.listWidth;
    args.ws.setListCollapsed(true);
  };
}

export function createToggleRightSidebarVisibility(args: BuildControllerLayoutPropsArgs) {
  return () => {
    if (args.ws.isRightSidebarCollapsed) {
      args.ws.setRightSidebarWidth(
        Math.max(
          RIGHT_SIDEBAR_WIDTH_DEFAULT,
          args.runtime.lastExpandedRightSidebarWidthRef.current ||
            args.ws.rightSidebarWidth ||
            RIGHT_SIDEBAR_WIDTH_DEFAULT
        )
      );
      return;
    }
    args.runtime.lastExpandedRightSidebarWidthRef.current = args.ws.rightSidebarWidth;
    args.ws.setRightSidebarCollapsed(true);
  };
}

export function createToggleBothSidebarVisibility(args: BuildControllerLayoutPropsArgs) {
  return () => {
    if (args.ws.isListCollapsed || args.ws.isRightSidebarCollapsed) {
      if (args.ws.isListCollapsed) {
        args.ws.setListWidth(
          Math.max(LIST_WIDTH_DEFAULT, args.runtime.lastExpandedListWidthRef.current || args.ws.listWidth || LIST_WIDTH_DEFAULT)
        );
      }
      if (args.ws.isRightSidebarCollapsed) {
        args.ws.setRightSidebarWidth(
          Math.max(
            RIGHT_SIDEBAR_WIDTH_DEFAULT,
            args.runtime.lastExpandedRightSidebarWidthRef.current ||
              args.ws.rightSidebarWidth ||
              RIGHT_SIDEBAR_WIDTH_DEFAULT
          )
        );
      }
      return;
    }
    args.runtime.lastExpandedListWidthRef.current = args.ws.listWidth;
    args.runtime.lastExpandedRightSidebarWidthRef.current = args.ws.rightSidebarWidth;
    args.ws.setListCollapsed(true);
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
    if (!adapter && (anchor.kind === 'highlight' || anchor.kind === 'image-excerpt') && isPdfAnchorLocator(anchor.locator)) {
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
    const caretSelection = {
      from: selection.from,
      to: selection.from
    };
    requestReadingPositionApply({
      nodeId: args.ws.activeNodeId,
      reason: 'reveal-anchor',
      runtime: args.runtime,
      selection: caretSelection,
      targetViewportMode: 'center'
    });
  };
}

export function createRevealDocumentSelection(args: BuildControllerLayoutPropsArgs) {
  return (selection: EditorSelection, targetViewportMode?: EditorViewportMode) => {
    if (args.runtime.isViewingTrashNode || !args.ws.activeNodeId) {
      return;
    }
    const adapter = args.runtime.editorRef.current;
    if (adapter) {
      writeNodeReadingPosition(args, selection);
      applyReadingPositionToActiveEditor(args, selection, targetViewportMode);
      requestReadingPositionApply({
        nodeId: args.ws.activeNodeId,
        reason: 'reveal-selection',
        runtime: args.runtime,
        selection,
        ...definedProps({ targetViewportMode })
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
      writeNodeReadingPosition(args, selection);
      applyReadingPositionToActiveEditor(args, selection);
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
  return (nodeId: string, viewState: NodeViewState) => {
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
