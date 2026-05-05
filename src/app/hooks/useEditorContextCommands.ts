import { useState } from 'react';
import type { MouseEvent as ReactMouseEvent, MutableRefObject } from 'react';

import type { EditorAdapter } from '../../features/editor/adapters/EditorAdapter';
import type { Node } from '../../features/nodes/model/nodeTypes';
import { copyAttachmentImageToClipboard, exportAttachmentImage } from '../../shared/platform/attachmentImageActions';
import type { WorkspaceEditorContextMenu } from '../components/WorkspaceLayout';
import {
  applySelectionMarkup,
  getSelectionCommandPayload,
  normalizeContextMenuPosition,
  type SelectionCommandPayload
} from '../contextCommands';
import { resolveImageContextMenuState, type ImageContextMenuState } from '../editorImageContextMenu';

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

interface SelectionContextMenuState extends WorkspaceEditorContextMenu {
  kind: 'selection';
  payload: SelectionCommandPayload | null;
}

type EditorContextMenuState = ImageContextMenuState | SelectionContextMenuState;

function refreshSelectionHighlight(adapter: EditorAdapter | null) {
  if (!adapter) {
    return;
  }
  const selection = adapter.getSelection();
  if (selection.from === selection.to) {
    return;
  }
  requestAnimationFrame(() => {
    adapter.setSelection(selection);
    adapter.focus();
  });
}

function createSelectionCommandRunner(
  contextMenu: SelectionContextMenuState | null,
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

function createHandleEditorContextMenu(args: {
  activeNode?: Node;
  activeNodeId: string | null;
  editorRef: MutableRefObject<EditorAdapter | null>;
  isTrashViewOpen: boolean;
  setContextMenu: (value: EditorContextMenuState) => void;
}) {
  return (event: ReactMouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (args.isTrashViewOpen || !args.activeNodeId || !args.activeNode) {
      return;
    }

    const position = normalizeContextMenuPosition(event.clientX, event.clientY);
    const imageContextMenu = resolveImageContextMenuState(event, position);
    if (imageContextMenu) {
      args.setContextMenu(imageContextMenu);
      return;
    }

    const commandPayload = getSelectionCommandPayload(args.activeNodeId, args.editorRef.current);
    args.setContextMenu({
      canRunCommands: !!commandPayload,
      kind: 'selection',
      left: position.left,
      payload: commandPayload,
      top: position.top
    });
    refreshSelectionHighlight(args.editorRef.current);
  };
}

function createSyncActiveNodeContentFromEditor(
  activeNodeId: string | null,
  editorRef: MutableRefObject<EditorAdapter | null>,
  updateNodeContent: (nodeId: string, content: string) => void
) {
  return () => {
    if (!activeNodeId || !editorRef.current) {
      return;
    }
    updateNodeContent(activeNodeId, editorRef.current.getContent());
  };
}

function createRemoveImageSource(
  contextMenu: EditorContextMenuState | null,
  editorRef: MutableRefObject<EditorAdapter | null>,
  syncActiveNodeContentFromEditor: () => void
) {
  return () => {
    if (contextMenu?.kind !== 'image' || !editorRef.current) {
      return;
    }
    editorRef.current.replaceRange(contextMenu.imageRange.from, contextMenu.imageRange.to, '');
    syncActiveNodeContentFromEditor();
  };
}

function createHandleCopyImage(
  contextMenu: EditorContextMenuState | null,
  closeContextMenu: () => void
) {
  return async () => {
    if (contextMenu?.kind !== 'image') {
      return;
    }
    await copyAttachmentImageToClipboard(contextMenu.imageAttachmentId);
    closeContextMenu();
  };
}

function createHandleCutImage(
  contextMenu: EditorContextMenuState | null,
  closeContextMenu: () => void,
  removeImageSource: () => void
) {
  return async () => {
    if (contextMenu?.kind !== 'image') {
      return;
    }
    const result = await copyAttachmentImageToClipboard(contextMenu.imageAttachmentId);
    if (result?.status !== 'copied') {
      closeContextMenu();
      return;
    }
    removeImageSource();
    closeContextMenu();
  };
}

function createHandleExportImage(
  contextMenu: EditorContextMenuState | null,
  closeContextMenu: () => void
) {
  return async () => {
    if (contextMenu?.kind !== 'image') {
      return;
    }
    await exportAttachmentImage(contextMenu.imageAttachmentId);
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
  const closeContextMenu = () => setContextMenu(null);
  const handleEditorContextMenu = createHandleEditorContextMenu({
    activeNode,
    activeNodeId,
    editorRef,
    isTrashViewOpen,
    setContextMenu
  });
  const syncActiveNodeContentFromEditor = createSyncActiveNodeContentFromEditor(
    activeNodeId,
    editorRef,
    updateNodeContent
  );
  const runSelectionCommand = createSelectionCommandRunner(
    contextMenu?.kind === 'selection' ? contextMenu : null,
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
  const removeImageSource = createRemoveImageSource(contextMenu, editorRef, syncActiveNodeContentFromEditor);
  const handleCopyImage = createHandleCopyImage(contextMenu, closeContextMenu);
  const handleCutImage = createHandleCutImage(contextMenu, closeContextMenu, removeImageSource);
  const handleExportImage = createHandleExportImage(contextMenu, closeContextMenu);
  const handleDeleteImage = () => (removeImageSource(), closeContextMenu());

  return {
    closeContextMenu,
    contextMenu,
    handleCopyImage,
    handleCreateCloze,
    handleCreateHighlight,
    handleCutImage,
    handleDeleteImage,
    handleEditorContextMenu,
    handleExportImage
  };
}
