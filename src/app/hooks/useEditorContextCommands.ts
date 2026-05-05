import { useEffect, useRef, useState } from 'react';
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
import type { Node, NodeAnchorLink } from '../../features/nodes/model/nodeTypes';
import { getSelectionCommandPayload, type SelectionCommandPayload } from '../contextCommands';

import { createSelectionHandlers, runSelectionCommandFromPayload } from './editorSelectionCommandActions';
import { createToggleSelectionHighlightFromPayloadHandler } from './selectionHighlightToggle';
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
  createHighlightNodeFromSelection: (
    parentNodeId: string,
    selectionText: string,
    anchorId: string,
    anchorLink?: NodeAnchorLink,
    imageRegions?: import('../../features/nodes/model/nodeTypes').NodeImageRegionGroup[] | null
  ) => string | null;
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
    anchorId: string,
    anchorLink?: NodeAnchorLink
  ) => string | null;
  deleteNodePermanently: (nodeId: string) => void;
  deleteImageClozeRegion: (parentNodeId: string, attachmentId: string, regionId: string) => void;
  editorRef: MutableRefObject<EditorAdapter | null>;
  isTrashViewOpen: boolean;
  trashedNodeIds: string[];
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

function usePreservedSelectionPayload(args: {
  activeNodeId: string | null;
  editorRef: MutableRefObject<EditorAdapter | null>;
}) {
  const preservedSelectionPayloadRef = useRef<SelectionCommandPayload | null>(null);

  useEffect(() => {
    preservedSelectionPayloadRef.current = null;
  }, [args.activeNodeId]);

  useEffect(() => {
    const preserveSelectionPayloadBeforeContextMenu = (event: MouseEvent) => {
      if (event.button !== 2) {
        return;
      }
      if (!args.activeNodeId) {
        preservedSelectionPayloadRef.current = null;
        return;
      }
      const payload = getSelectionCommandPayload(args.activeNodeId, args.editorRef.current);
      if (payload) {
        preservedSelectionPayloadRef.current = payload;
      }
    };

    document.addEventListener('mousedown', preserveSelectionPayloadBeforeContextMenu, true);
    return () => {
      document.removeEventListener('mousedown', preserveSelectionPayloadBeforeContextMenu, true);
    };
  }, [args.activeNodeId, args.editorRef]);

  return preservedSelectionPayloadRef;
}

export function useEditorContextCommands({
  activeNode,
  activeNodeId,
  createChildNode,
  createHighlightNodeFromSelection,
  createImageClozeNodes = () => [],
  createQANodeFromSelection,
  deleteNodePermanently,
  deleteImageClozeRegion,
  editorRef,
  isTrashViewOpen,
  trashedNodeIds,
  nodesById,
  onExitImmersiveMode,
  onSelectNode,
  updateNodeContent
}: UseEditorContextCommandsParams) {
  const [contextMenu, setContextMenu] = useState<EditorContextMenuState | null>(null);
  const preservedSelectionPayloadRef = usePreservedSelectionPayload({ activeNodeId, editorRef });
  useImageClozeEventBridge({ activeNode, activeNodeId, createImageClozeNodes, deleteImageClozeRegion, editorRef, nodesById });
  const closeContextMenu = () => setContextMenu(null);
  const syncActiveNodeContentFromEditor = createSyncActiveNodeContentFromEditor(activeNodeId, editorRef, updateNodeContent);
  const handleEditorContextMenu = createHandleEditorContextMenu({
    activeNode,
    activeNodeId,
    editorRef,
    getPreservedSelectionPayload: () => preservedSelectionPayloadRef.current,
    isTrashViewOpen,
    setContextMenu
  });
  const runSelectionCommand = createSelectionCommandRunner(
    contextMenu ? { payload: contextMenu.payload } : null,
    editorRef,
    closeContextMenu
  );
  const runSelectionCommandFromPayloadHandler = createPayloadSelectionRunner(closeContextMenu, editorRef);
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
    activeNodeId,
    closeContextMenu,
    contextMenu,
    deleteNodePermanently,
    editorRef,
    handleEditorContextMenu,
    nodesById,
    selectionHandlers,
    trashedNodeIds,
    syncActiveNodeContentFromEditor
  });
}

function createPayloadSelectionRunner(
  closeContextMenu: () => void,
  editorRef: MutableRefObject<EditorAdapter | null>
) {
  return ({
    onApplied,
    payload
  }: {
    onApplied: (payload: Parameters<typeof runSelectionCommandFromPayload>[0]['payload']) => string | null;
    payload: Parameters<typeof runSelectionCommandFromPayload>[0]['payload'];
  }) =>
    runSelectionCommandFromPayload({
      closeContextMenu,
      editorRef,
      onApplied,
      payload
    });
}

function buildEditorCommandsResult(args: {
  activeNodeId: string | null;
  closeContextMenu: () => void;
  contextMenu: EditorContextMenuState | null;
  deleteNodePermanently: (nodeId: string) => void;
  editorRef: MutableRefObject<EditorAdapter | null>;
  handleEditorContextMenu: ReturnType<typeof createHandleEditorContextMenu>;
  nodesById: Record<string, Node>;
  selectionHandlers: ReturnType<typeof createSelectionHandlers>;
  trashedNodeIds: string[];
  syncActiveNodeContentFromEditor: () => void;
}) {
  const imageHandlers = createImageCommandHandlers({
    closeContextMenu: args.closeContextMenu,
    contextMenu: args.contextMenu,
    editorRef: args.editorRef,
    syncActiveNodeContentFromEditor: args.syncActiveNodeContentFromEditor
  });
  const handleToggleSelectionHighlightFromPayload = createToggleSelectionHighlightFromPayloadHandler({
    activeNodeId: args.activeNodeId,
    createHighlightFromPayload: args.selectionHandlers.handleCreateHighlightFromPayload,
    deleteNodePermanently: args.deleteNodePermanently,
    editorRef: args.editorRef,
    nodesById: args.nodesById,
    syncActiveNodeContentFromEditor: args.syncActiveNodeContentFromEditor,
    trashedNodeIds: args.trashedNodeIds
  });

  return buildEditorContextCommandsResult({
    closeContextMenu: args.closeContextMenu,
    contextMenu: args.contextMenu,
    handleCopyImage: imageHandlers.handleCopyImage,
    handleCreateCloze: args.selectionHandlers.handleCreateCloze,
    handleCreateClozeFromPayload: args.selectionHandlers.handleCreateClozeFromPayload,
    handleCreateHighlight: args.selectionHandlers.handleCreateHighlight,
    handleCreateHighlightFromPayload: args.selectionHandlers.handleCreateHighlightFromPayload,
    handleToggleSelectionHighlightFromPayload,
    handleCreateNoteFromPayload: args.selectionHandlers.handleCreateNoteFromPayload,
    handleCutImage: imageHandlers.handleCutImage,
    handleDeleteImage: imageHandlers.handleDeleteImage,
    handleEditorContextMenu: args.handleEditorContextMenu,
    handleExportImage: imageHandlers.handleExportImage
  });
}
