import { useEffect, useState } from 'react';
import type { MutableRefObject } from 'react';

import type { EditorAdapter } from '../../features/editor/adapters/EditorAdapter';
import type { ImageClozeDraftRegion, ImageClozeSourcePayload } from '../../features/image-cloze/model/imageCloze';
import { buildImageClozeSourcePayload } from '../../features/image-cloze/model/imageCloze';
import {
  IMAGE_CLOZE_CREATE_EVENT,
  IMAGE_CLOZE_DELETE_EVENT,
  type ImageClozeCreateEventDetail,
  type ImageClozeDeleteEventDetail
} from '../../features/image-cloze/model/imageClozeEvents';
import type { Node } from '../../features/nodes/model/nodeTypes';

import { createSelectionHandlers, runSelectionCommandFromPayload } from './editorSelectionCommandActions';
import {
  buildEditorContextCommandsResult,
  createHandleEditorContextMenu,
  createImageCommandHandlers,
  createSelectionCommandRunner,
  createSyncActiveNodeContentFromEditor,
  type EditorContextMenuState
} from './useEditorContextCommandHelpers';

interface UseEditorContextCommandsParams {
  activeNode?: Node;
  activeNodeId: string | null;
  createChildNode: (parentNodeId: string, content?: string) => string;
  createHighlightNodeFromSelection: (parentNodeId: string, selectionText: string, anchorId: string) => string | null;
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
  ) => string | null;
  deleteImageClozeRegion: (parentNodeId: string, attachmentId: string, regionId: string) => void;
  editorRef: MutableRefObject<EditorAdapter | null>;
  isTrashViewOpen: boolean;
  nodesById: Record<string, Node>;
  onExitImmersiveMode: () => void;
  onSelectNode: (nodeId: string) => void;
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
  deleteImageClozeRegion: (parentNodeId: string, attachmentId: string, regionId: string) => void;
  editorRef: MutableRefObject<EditorAdapter | null>;
  nodesById: Record<string, Node>;
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

      args.createImageClozeNodes(args.activeNodeId, detail.attachmentId, sourcePayload, detail.regions);
    };

    const handleImageClozeDelete = (event: Event) => {
      const detail = (event as CustomEvent<ImageClozeDeleteEventDetail>).detail;
      if (!args.activeNodeId || !detail?.attachmentId || !detail?.regionId) {
        return;
      }
      args.deleteImageClozeRegion(args.activeNodeId, detail.attachmentId, detail.regionId);
    };

    window.addEventListener(IMAGE_CLOZE_CREATE_EVENT, handleImageClozeCreate as EventListener);
    window.addEventListener(IMAGE_CLOZE_DELETE_EVENT, handleImageClozeDelete as EventListener);
    return () => {
      window.removeEventListener(IMAGE_CLOZE_CREATE_EVENT, handleImageClozeCreate as EventListener);
      window.removeEventListener(IMAGE_CLOZE_DELETE_EVENT, handleImageClozeDelete as EventListener);
    };
  }, [args]);
}

export function useEditorContextCommands({
  activeNode,
  activeNodeId,
  createChildNode,
  createHighlightNodeFromSelection,
  createImageClozeNodes = () => [],
  createQANodeFromSelection,
  deleteImageClozeRegion,
  editorRef,
  isTrashViewOpen,
  nodesById,
  onExitImmersiveMode,
  onSelectNode,
  updateNodeContent
}: UseEditorContextCommandsParams) {
  const [contextMenu, setContextMenu] = useState<EditorContextMenuState | null>(null);
  useImageClozeEventBridge({ activeNode, activeNodeId, createImageClozeNodes, deleteImageClozeRegion, editorRef, nodesById });
  const closeContextMenu = () => setContextMenu(null);
  const syncActiveNodeContentFromEditor = createSyncActiveNodeContentFromEditor(activeNodeId, editorRef, updateNodeContent);
  const handleEditorContextMenu = createHandleEditorContextMenu({
    activeNode,
    activeNodeId,
    editorRef,
    isTrashViewOpen,
    setContextMenu
  });
  const runSelectionCommand = createSelectionCommandRunner(
    contextMenu?.kind === 'selection' ? contextMenu : null,
    editorRef,
    closeContextMenu,
    syncActiveNodeContentFromEditor
  );
  const runSelectionCommandFromPayloadHandler = createPayloadSelectionRunner(closeContextMenu, editorRef, syncActiveNodeContentFromEditor);
  const selectionHandlers = createSelectionHandlers({
    createChildNode,
    createHighlightNodeFromSelection,
    createQANodeFromSelection,
    onExitImmersiveMode,
    onSelectNode,
    runSelectionCommand,
    runSelectionCommandFromPayloadHandler
  });
  return buildEditorCommandsResult({
    closeContextMenu,
    contextMenu,
    editorRef,
    handleEditorContextMenu,
    selectionHandlers,
    syncActiveNodeContentFromEditor
  });
}

function createPayloadSelectionRunner(
  closeContextMenu: () => void,
  editorRef: MutableRefObject<EditorAdapter | null>,
  syncActiveNodeContentFromEditor: () => void
) {
  return ({
    onApplied,
    payload,
    type
  }: {
    onApplied: (payload: Parameters<typeof runSelectionCommandFromPayload>[0]['payload']) => string | null;
    payload: Parameters<typeof runSelectionCommandFromPayload>[0]['payload'];
    type: Parameters<typeof runSelectionCommandFromPayload>[0]['type'];
  }) =>
    runSelectionCommandFromPayload({
      closeContextMenu,
      editorRef,
      onApplied,
      payload,
      syncActiveNodeContentFromEditor,
      type
    });
}

function buildEditorCommandsResult(args: {
  closeContextMenu: () => void;
  contextMenu: EditorContextMenuState | null;
  editorRef: MutableRefObject<EditorAdapter | null>;
  handleEditorContextMenu: ReturnType<typeof createHandleEditorContextMenu>;
  selectionHandlers: ReturnType<typeof createSelectionHandlers>;
  syncActiveNodeContentFromEditor: () => void;
}) {
  const imageHandlers = createImageCommandHandlers({
    closeContextMenu: args.closeContextMenu,
    contextMenu: args.contextMenu,
    editorRef: args.editorRef,
    syncActiveNodeContentFromEditor: args.syncActiveNodeContentFromEditor
  });

  return buildEditorContextCommandsResult({
    closeContextMenu: args.closeContextMenu,
    contextMenu: args.contextMenu,
    handleCopyImage: imageHandlers.handleCopyImage,
    handleCreateCloze: args.selectionHandlers.handleCreateCloze,
    handleCreateClozeFromPayload: args.selectionHandlers.handleCreateClozeFromPayload,
    handleCreateHighlight: args.selectionHandlers.handleCreateHighlight,
    handleCreateHighlightFromPayload: args.selectionHandlers.handleCreateHighlightFromPayload,
    handleCreateNoteFromPayload: args.selectionHandlers.handleCreateNoteFromPayload,
    handleCutImage: imageHandlers.handleCutImage,
    handleDeleteImage: imageHandlers.handleDeleteImage,
    handleEditorContextMenu: args.handleEditorContextMenu,
    handleExportImage: imageHandlers.handleExportImage
  });
}
