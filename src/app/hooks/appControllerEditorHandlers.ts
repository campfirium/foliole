import type { EditorAdapter, EditorContentChangeMeta } from '../../features/editor/adapters/EditorAdapter';
import { setConnectedEditorAdapter } from '../../features/editor/adapters/editorAdapterConnection';
import { getEditorTextHistorySource } from '../../features/editor/model/editorNativeOperationHistory';
import { getEditorOperationSession } from '../../features/editor/model/editorOperationHistory';
import type { NodeAnchorLink } from '../../features/nodes/model/nodeTypes';
import { INBOX_NODE_ID } from '../../features/nodes/model/specialNodes';
import { useWorkspaceStore } from '../../store/workspaceStore';
import type { EditorOperationApplyContext } from '../../store/workspaceStoreTypes';

import { isVirtualEditorNode } from './appControllerLayoutContext';
import type { BuildControllerLayoutPropsArgs } from './appControllerLayoutProps';
import { applyEditorTextReplay } from './editorTextReplaySave';
import type { EditorDraftCommitOptions } from './useEditorDraftFlushCallbacks';


export type SelectNodeHandler = (nodeId: string, focusAnchor?: NodeAnchorLink | null) => void;

function isBlankTextEditAfterAnnotation(args: BuildControllerLayoutPropsArgs, nodeId: string, content: string) {
  const node = args.ws.nodesById[nodeId];
  const session = getEditorOperationSession(args.ws.editorOperationHistory, nodeId);
  const topEntries = [
    session.undoStack.at(-1),
    session.redoStack.at(-1)
  ];
  return (
    content.length === 0 &&
    Boolean(node?.content) &&
    topEntries.some((entry) => entry?.type === 'annotation.create' && entry.nodeId === nodeId)
  );
}

export function createAnswerChangeHandler(args: BuildControllerLayoutPropsArgs) {
  return (answer: string, meta?: EditorContentChangeMeta) => {
    args.runtime.flushPendingEditorDraft?.();
    if (args.ws.activeNodeId && !args.runtime.isViewingTrashNode) {
      args.ws.updateNodeReveal(args.ws.activeNodeId, answer, {
        ...(meta?.historySave ? { historySave: meta.historySave } : {}),
        ...(meta?.newImageReferences ? { newImageReferences: meta.newImageReferences } : {})
      });
    }
  };
}

export function createEditorChangeHandler(args: BuildControllerLayoutPropsArgs) {
  return (content: string) => {
    if (args.runtime.isViewingTrashNode || content.length === 0) {
      return;
    }
    if (args.ws.activeNodeId) {
      return;
    }
    args.ws.createChildNode(INBOX_NODE_ID, content);
  };
}

export function createEditorReadyHandler(args: BuildControllerLayoutPropsArgs) {
  return (adapter: EditorAdapter | null) => {
    setConnectedEditorAdapter(args.runtime.editorRef, adapter);
    adapter?.bindTextHistorySource?.(nodeId => getEditorTextHistorySource(useWorkspaceStore.getState().editorOperationHistory, nodeId));
  };
}

export function createEditorOperationApplyContext(
  args: {
    runtime: { editorRef: { current: EditorAdapter | null } };
    ws: Pick<BuildControllerLayoutPropsArgs['ws'], 'activeNodeId' | 'nodesById'>;
  }
): EditorOperationApplyContext | undefined {
  const nodeId = args.ws.activeNodeId;
  const node = nodeId ? args.ws.nodesById[nodeId] : undefined;
  if (!nodeId || !node) return undefined;
  const editor = args.runtime.editorRef.current;
  return {
    applyText: (entry, mode) => applyEditorTextReplay(editor, entry, mode),
    currentContent: editor?.getContent() ?? node.content,
    getCurrentContent: () => editor?.getContent() ?? args.ws.nodesById[nodeId]?.content ?? '',
    nodeId
  };
}

export function createEditorUndoHandler(args: BuildControllerLayoutPropsArgs) {
  return () => args.ws.undoEditorOperation(createEditorOperationApplyContext(args));
}

export function createEditorRedoHandler(args: BuildControllerLayoutPropsArgs) {
  return () => args.ws.redoEditorOperation(createEditorOperationApplyContext(args));
}

export function createNodeContentChangeHandler(args: BuildControllerLayoutPropsArgs) {
  return (nodeId: string, content: string, options?: EditorDraftCommitOptions) => {
    if (args.runtime.isViewingTrashNode) {
      return;
    }
    if (isVirtualEditorNode(args, nodeId)) {
      args.ws.updateVirtualNodeFilter(nodeId, content);
      return;
    }
    if (!options?.historyReplay && isBlankTextEditAfterAnnotation(args, nodeId, content)) {
      return;
    }
    args.ws.updateNodeContent(nodeId, content, { ...options, deriveTitle: true });
  };
}
