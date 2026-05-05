import type { EditorAdapter } from '../../features/editor/adapters/EditorAdapter';
import type { NodeAnchorLink } from '../../features/nodes/model/nodeTypes';
import { INBOX_NODE_ID } from '../../features/nodes/model/specialNodes';

import { isVirtualEditorNode } from './appControllerLayoutContext';
import type { BuildControllerLayoutPropsArgs } from './appControllerLayoutProps';

export type SelectNodeHandler = (nodeId: string, focusAnchor?: NodeAnchorLink | null) => void;

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
  return (nodeId: string, content: string) => {
    if (args.runtime.isViewingTrashNode) {
      return;
    }
    if (isVirtualEditorNode(args, nodeId)) {
      args.ws.updateVirtualNodeFilter(nodeId, content);
      return;
    }
    args.ws.updateNodeContent(nodeId, content);
  };
}
