import { useEffect, useState } from 'react';
import type { MutableRefObject } from 'react';

import type { EditorAdapter } from '../../features/editor/adapters/EditorAdapter';
import type { ImageClozeDraftRegion, ImageClozeSourcePayload } from '../../features/image-cloze/model/imageCloze';
import { buildImageClozeSourcePayload } from '../../features/image-cloze/model/imageCloze';
import { IMAGE_CLOZE_CREATE_EVENT, type ImageClozeCreateEventDetail } from '../../features/image-cloze/model/imageClozeEvents';
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

interface UseEditorContextCommandsParams {
  activeNode?: Node;
  activeNodeId: string | null;
  createHighlightNodeFromSelection: (parentNodeId: string, selectionText: string, anchorId: string) => void;
  createImageClozeNodes?: (
    parentNodeId: string,
    attachmentId: string,
    sourcePayload: ImageClozeSourcePayload,
    regions: ImageClozeDraftRegion[]
  ) => string[];
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

function useImageClozeEventBridge(args: {
  activeNode?: Node;
  activeNodeId: string | null;
  createImageClozeNodes: (
    parentNodeId: string,
    attachmentId: string,
    sourcePayload: ImageClozeSourcePayload,
    regions: ImageClozeDraftRegion[]
  ) => string[];
  editorRef: MutableRefObject<EditorAdapter | null>;
}) {
  useEffect(() => {
    const handleImageClozeCreate = (event: Event) => {
      const detail = (event as CustomEvent<ImageClozeCreateEventDetail>).detail;
      if (!args.activeNodeId || !detail?.attachmentId) {
        return;
      }

      const sourcePayload = buildImageClozeSourcePayload(
        args.editorRef.current?.getContent() ?? args.activeNode?.content ?? '',
        detail.imageRange
      );
      if (!sourcePayload) {
        return;
      }

      args.createImageClozeNodes(args.activeNodeId, detail.attachmentId, sourcePayload, [detail.region]);
    };

    window.addEventListener(IMAGE_CLOZE_CREATE_EVENT, handleImageClozeCreate as EventListener);
    return () => {
      window.removeEventListener(IMAGE_CLOZE_CREATE_EVENT, handleImageClozeCreate as EventListener);
    };
  }, [args]);
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
  useImageClozeEventBridge({ activeNode, activeNodeId, createImageClozeNodes, editorRef });
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
  const { handleCopyImage, handleCutImage, handleDeleteImage, handleExportImage } = createImageCommandHandlers({
    closeContextMenu,
    contextMenu,
    editorRef,
    syncActiveNodeContentFromEditor
  });

  return buildEditorContextCommandsResult({
    closeContextMenu,
    contextMenu,
    handleCopyImage,
    handleCreateCloze,
    handleCreateHighlight,
    handleCutImage,
    handleDeleteImage,
    handleEditorContextMenu,
    handleExportImage
  });
}
