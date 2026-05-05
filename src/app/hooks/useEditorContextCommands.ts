import { useState } from 'react';
import type { MouseEvent as ReactMouseEvent, MutableRefObject } from 'react';

import type { EditorAdapter } from '../../features/editor/adapters/EditorAdapter';
import type { Node } from '../../features/nodes/model/nodeTypes';
import type { WorkspaceEditorContextMenu } from '../components/WorkspaceLayout';
import {
  applySelectionMarkup,
  getSelectionCommandPayload,
  normalizeContextMenuPosition,
  type SelectionCommandPayload
} from '../contextCommands';

interface UseEditorContextCommandsParams {
  activeNode?: Node;
  activeNodeId: string | null;
  createHighlightNodeFromSelection: (parentNodeId: string, selectionText: string, anchorId: string) => void;
  createQANodeFromSelection: (
    parentNodeId: string,
    clozeContent: string,
    answer: string,
    anchorId: string
  ) => void;
  editorRef: MutableRefObject<EditorAdapter | null>;
  isTrashViewOpen: boolean;
  updateNodeContent: (nodeId: string, content: string) => void;
}

interface EditorContextMenuState extends WorkspaceEditorContextMenu {
  payload: SelectionCommandPayload | null;
}

export function useEditorContextCommands({
  activeNode,
  activeNodeId,
  createHighlightNodeFromSelection,
  createQANodeFromSelection,
  editorRef,
  isTrashViewOpen,
  updateNodeContent
}: UseEditorContextCommandsParams) {
  const [contextMenu, setContextMenu] = useState<EditorContextMenuState | null>(null);

  const closeContextMenu = () => {
    setContextMenu(null);
  };

  const handleEditorContextMenu = (event: ReactMouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (isTrashViewOpen || !activeNodeId || !activeNode) {
      return;
    }

    const commandPayload = getSelectionCommandPayload(activeNodeId, editorRef.current);
    const position = normalizeContextMenuPosition(event.clientX, event.clientY);
    setContextMenu({
      canRunCommands: !!commandPayload,
      left: position.left,
      payload: commandPayload,
      top: position.top
    });
  };

  const syncActiveNodeContentFromEditor = () => {
    if (!activeNodeId || !editorRef.current) {
      return;
    }
    updateNodeContent(activeNodeId, editorRef.current.getContent());
  };

  const handleCreateHighlight = () => {
    const payload = contextMenu?.payload;
    if (!payload) {
      return;
    }
    const applied = applySelectionMarkup(editorRef.current, 'highlight', payload.anchorId);
    if (!applied) {
      closeContextMenu();
      return;
    }
    syncActiveNodeContentFromEditor();
    createHighlightNodeFromSelection(payload.parentNodeId, payload.selectionText, payload.anchorId);
    closeContextMenu();
  };

  const handleCreateCloze = () => {
    const payload = contextMenu?.payload;
    if (!payload) {
      return;
    }
    const applied = applySelectionMarkup(editorRef.current, 'cloze', payload.anchorId);
    if (!applied) {
      closeContextMenu();
      return;
    }
    syncActiveNodeContentFromEditor();
    createQANodeFromSelection(payload.parentNodeId, payload.clozeContent, payload.selectionText, payload.anchorId);
    closeContextMenu();
  };

  return {
    closeContextMenu,
    contextMenu,
    handleCreateCloze,
    handleCreateHighlight,
    handleEditorContextMenu
  };
}
