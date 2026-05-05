import { useState } from 'react';
import type { MutableRefObject } from 'react';

import type { EditorAdapter } from '../../features/editor/adapters/EditorAdapter';
import type { ImageClozeDraftRegion } from '../../features/image-cloze/model/imageCloze';
import type { Node } from '../../features/nodes/model/nodeTypes';

import {
  buildEditorContextCommandsResult,
  createHandleEditorContextMenu,
  createImageCommandHandlers,
  createSelectionCommandRunner,
  createSelectionHandlers,
  createSyncActiveNodeContentFromEditor,
  type EditorContextMenuState
} from './useEditorContextCommandHelpers';
import type { ImageClozeComposerState } from './useEditorImageClozeCommands';

interface UseEditorContextCommandsParams {
  activeNode?: Node;
  activeNodeId: string | null;
  createHighlightNodeFromSelection: (parentNodeId: string, selectionText: string, anchorId: string) => void;
  createImageClozeNodes?: (parentNodeId: string, attachmentId: string, regions: ImageClozeDraftRegion[]) => string[];
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

export function useEditorContextCommands({
  activeNode,
  activeNodeId,
  createHighlightNodeFromSelection,
  createImageClozeNodes = () => [],
  createQANodeFromSelection,
  editorRef,
  isTrashViewOpen,
  updateNodeContent
}: UseEditorContextCommandsParams) {
  const [contextMenu, setContextMenu] = useState<EditorContextMenuState | null>(null);
  const [imageClozeComposer, setImageClozeComposer] = useState<ImageClozeComposerState | null>(null);
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
  const { handleCreateCloze, handleCreateHighlight } = createSelectionHandlers(
    runSelectionCommand,
    createHighlightNodeFromSelection,
    createQANodeFromSelection
  );
  const { handleCloseImageClozeComposer, handleCopyImage, handleCreateImageCloze, handleCutImage, handleDeleteImage, handleExportImage, handleSaveImageCloze } = createImageCommandHandlers({
    activeNodeId,
    closeContextMenu,
    contextMenu,
    createImageClozeNodes,
    editorRef,
    imageClozeComposer,
    setImageClozeComposer,
    syncActiveNodeContentFromEditor
  });
  return buildEditorContextCommandsResult({ closeContextMenu, contextMenu, handleCopyImage, handleCreateCloze, handleCreateHighlight, handleCreateImageCloze, handleCutImage, handleDeleteImage, handleEditorContextMenu, handleExportImage, handleCloseImageClozeComposer, handleSaveImageCloze, imageClozeComposer });
}
