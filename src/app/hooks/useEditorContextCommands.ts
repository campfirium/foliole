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

function createSelectionCommandRunner(
  contextMenu: EditorContextMenuState | null,
  editorRef: MutableRefObject<EditorAdapter | null>,
  closeContextMenu: () => void,
  syncActiveNodeContentFromEditor: () => void
) {
  return (onApplied: (payload: SelectionCommandPayload) => void, anchorKind: 'highlight' | 'cloze') => {
    const payload = contextMenu?.payload;
    if (!payload) {
      return;
    }
    const applied = applySelectionMarkup(editorRef.current, anchorKind, payload.anchorId);
    if (!applied) {
      closeContextMenu();
      return;
    }
    syncActiveNodeContentFromEditor();
    onApplied(payload);
    closeContextMenu();
  };
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

  const runSelectionCommand = createSelectionCommandRunner(
    contextMenu,
    editorRef,
    closeContextMenu,
    syncActiveNodeContentFromEditor
  );

  const handleCreateHighlight = () => {
    runSelectionCommand((payload) => {
      createHighlightNodeFromSelection(payload.parentNodeId, payload.selectionText, payload.anchorId);
    }, 'highlight');
  };

  const handleCreateCloze = () => {
    runSelectionCommand((payload) => {
      createQANodeFromSelection(payload.parentNodeId, payload.clozeContent, payload.selectionText, payload.anchorId);
    }, 'cloze');
  };

  return {
    closeContextMenu,
    contextMenu,
    handleCreateCloze,
    handleCreateHighlight,
    handleEditorContextMenu
  };
}
