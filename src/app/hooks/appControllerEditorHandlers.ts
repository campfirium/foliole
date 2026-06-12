import type { EditorAdapter } from '../../features/editor/adapters/EditorAdapter';
import type { NodeAnchorLink } from '../../features/nodes/model/nodeTypes';
import { INBOX_NODE_ID, isProtectedRootNode } from '../../features/nodes/model/specialNodes';
import { isNodeDocumentLoaded } from '../../store/workspaceRendererBoundary';

import { isVirtualEditorNode } from './appControllerLayoutContext';
import type { BuildControllerLayoutPropsArgs } from './appControllerLayoutProps';

export type SelectNodeHandler = (nodeId: string, focusAnchor?: NodeAnchorLink | null) => void;

function isBlankTextEditAfterAnnotation(args: BuildControllerLayoutPropsArgs, nodeId: string, content: string) {
  const node = args.ws.nodesById[nodeId];
  const topEntries = [
    args.ws.editorOperationHistory.undoStack.at(-1),
    args.ws.editorOperationHistory.redoStack.at(-1)
  ];
  return (
    content.length === 0 &&
    Boolean(node?.content) &&
    topEntries.some((entry) => entry?.type === 'annotation.create' && entry.nodeId === nodeId)
  );
}

function pushTextEditOperation(args: BuildControllerLayoutPropsArgs, nodeId: string, content: string) {
  const node = args.ws.nodesById[nodeId];
  if (
    !node ||
    node.content === content ||
    isBlankTextEditAfterAnnotation(args, nodeId, content) ||
    args.ws.trashedNodeIds.includes(nodeId) ||
    !isNodeDocumentLoaded(node) ||
    isProtectedRootNode(node)
  ) {
    return;
  }
  args.ws.pushEditorOperationEntry({
    afterContent: content,
    beforeContent: node.content,
    nodeId,
    title: 'Edit Text',
    type: 'text.edit'
  });
}

export function createAnswerChangeHandler(args: BuildControllerLayoutPropsArgs) {
  return (answer: string) => {
    if (args.ws.activeNodeId && !args.runtime.isViewingTrashNode) {
      args.ws.updateNodeReveal(args.ws.activeNodeId, answer);
    }
  };
}

export function createEditorChangeHandler(args: BuildControllerLayoutPropsArgs) {
  return (content: string) => {
    if (args.runtime.isViewingTrashNode) {
      return;
    }
    if (args.ws.activeNodeId) {
      if (isBlankTextEditAfterAnnotation(args, args.ws.activeNodeId, content)) {
        return;
      }
      pushTextEditOperation(args, args.ws.activeNodeId, content);
      args.ws.updateNodeContent(args.ws.activeNodeId, content);
      return;
    }
    args.ws.createChildNode(INBOX_NODE_ID, content);
  };
}

export function createEditorReadyHandler(args: BuildControllerLayoutPropsArgs) {
  return (adapter: EditorAdapter | null) => {
    args.runtime.editorRef.current = adapter;
  };
}

export function createNodeContentChangeHandler(args: BuildControllerLayoutPropsArgs) {
  return (nodeId: string, content: string, options?: { publishLocal?: boolean }) => {
    if (args.runtime.isViewingTrashNode) {
      return;
    }
    if (isVirtualEditorNode(args, nodeId)) {
      args.ws.updateVirtualNodeFilter(nodeId, content);
      return;
    }
    if (isBlankTextEditAfterAnnotation(args, nodeId, content)) {
      return;
    }
    pushTextEditOperation(args, nodeId, content);
    args.ws.updateNodeContent(nodeId, content, options);
  };
}
