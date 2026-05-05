import { isInboxNode, isVirtualNode } from '../../features/nodes/model/specialNodes';

import type { BuildControllerLayoutPropsArgs } from './appControllerLayoutProps';
import { createPdfHighlightHandler } from './appControllerPdfHighlight';

export function resolveEditorBindingArgs(args: BuildControllerLayoutPropsArgs) {
  const isInboxActiveNode = !args.runtime.isViewingTrashNode && isInboxNode(args.activeNode);
  return {
    editorNodeId: args.runtime.isViewingTrashNode || isInboxActiveNode ? null : args.ws.activeNodeId,
    editorNodeViewState:
      !args.runtime.isViewingTrashNode && !isInboxActiveNode && args.ws.activeNodeId
        ? args.ws.nodeViewById[args.ws.activeNodeId]
        : undefined
  };
}

export function createLayoutEditorCtx(args: BuildControllerLayoutPropsArgs) {
  return {
    onCloseContextMenu: args.editorCtx.closeContextMenu,
    onCopyImage: args.editorCtx.handleCopyImage,
    onCreateCloze: args.editorCtx.handleCreateCloze,
    onCreateHighlight: args.editorCtx.handleCreateHighlight,
    onCreatePdfHighlight: createPdfHighlightHandler(args),
    onCutImage: args.editorCtx.handleCutImage,
    onDeleteImage: args.editorCtx.handleDeleteImage,
    onEditorContextMenu: args.editorCtx.handleEditorContextMenu,
    onExportImage: args.editorCtx.handleExportImage
  };
}

export function isVirtualEditorNode(args: BuildControllerLayoutPropsArgs, nodeId: string) {
  return isVirtualNode(args.ws.nodesById[nodeId]);
}
