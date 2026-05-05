import { useEffect, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';

import { appendHighlightCardNote } from '../../../lib/core/annotations/textAnnotationContent';
import type { EditorAdapter } from '../../features/editor/adapters/EditorAdapter';
import { getHighlightAnnotationPrefix } from '../../features/editor/model/highlightAnnotationPrefixSetting';
import type { ImageClozeDraftRegion, ImageClozeSourcePayload } from '../../features/image-cloze/model/imageCloze';
import type { Node, NodeAnchorLink } from '../../features/nodes/model/nodeTypes';
import { getSelectionCommandPayload, type SelectionCommandPayload } from '../contextCommands';

import { createSelectionHandlers, runSelectionCommandFromPayload } from './editorSelectionCommandActions';
import {
  createAddNoteToSelectionHighlightFromPayloadHandler,
  createToggleSelectionHighlightFromPayloadHandler
} from './selectionHighlightToggle';
import {
  buildEditorContextCommandsResult,
  createHandleEditorContextMenu,
  createImageCommandHandlers,
  createSelectionCommandRunner,
  createSyncActiveNodeContentFromEditor,
  type EditorContextMenuState
} from './useEditorContextCommandHelpers';
import { useImageClozeEventBridge } from './useImageClozeEventBridge';
import { useSelectionAnnotationToolbar } from './useSelectionAnnotationToolbar';

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
  useSelectionAnnotationToolbar({ activeNodeId, editorRef, isTrashViewOpen, nodesById, setContextMenu, trashedNodeIds });
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
  const runSelectionCommand = createSelectionCommandRunner(contextMenu ? { payload: contextMenu.payload } : null, editorRef, closeContextMenu);
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
    onSelectNode,
    selectionHandlers,
    trashedNodeIds,
    syncActiveNodeContentFromEditor,
    updateNodeContent
  });
}

function createPayloadSelectionRunner(
  closeContextMenu: () => void,
  editorRef: MutableRefObject<EditorAdapter | null>
) {
  return ({
    onApplied,
    payload,
    keepOpen
  }: {
    keepOpen?: boolean;
    onApplied: (payload: Parameters<typeof runSelectionCommandFromPayload>[0]['payload']) => string | null;
    payload: Parameters<typeof runSelectionCommandFromPayload>[0]['payload'];
  }) =>
    runSelectionCommandFromPayload({
      closeContextMenu,
      editorRef,
      keepOpen,
      onApplied,
      payload
    });
}

function createExistingHighlightHandlers(args: {
  closeContextMenu: () => void;
  contextMenu: EditorContextMenuState | null;
  deleteNodePermanently: (nodeId: string) => void;
  nodesById: Record<string, Node>;
  selectionHandlers: ReturnType<typeof createSelectionHandlers>;
  updateNodeContent: (nodeId: string, content: string) => void;
}) {
  const existingHighlight = args.contextMenu?.kind === 'selection' ? args.contextMenu.existingHighlight : null;
  return {
    handleCreateNote(note: string) {
      if (!existingHighlight) {
        args.selectionHandlers.handleCreateNote(note);
        return;
      }
      const node = args.nodesById[existingHighlight.nodeId];
      if (!node) {
        return;
      }
      args.updateNodeContent(existingHighlight.nodeId, appendHighlightCardNote({
        content: node.content,
        note,
        notePrefix: getHighlightAnnotationPrefix(),
        originalText: existingHighlight.originalText
      }));
    },
    handleDeleteExistingHighlight() {
      if (!existingHighlight) {
        return;
      }
      args.deleteNodePermanently(existingHighlight.nodeId);
      args.closeContextMenu();
    }
  };
}

function buildEditorCommandsResult(args: {
  activeNodeId: string | null;
  closeContextMenu: () => void;
  contextMenu: EditorContextMenuState | null;
  deleteNodePermanently: (nodeId: string) => void;
  editorRef: MutableRefObject<EditorAdapter | null>;
  handleEditorContextMenu: ReturnType<typeof createHandleEditorContextMenu>;
  nodesById: Record<string, Node>;
  onSelectNode: (nodeId: string) => void;
  selectionHandlers: ReturnType<typeof createSelectionHandlers>;
  trashedNodeIds: string[];
  syncActiveNodeContentFromEditor: () => void;
  updateNodeContent: (nodeId: string, content: string) => void;
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
  const handleAddNoteToSelectionHighlightFromPayload = createAddNoteToSelectionHighlightFromPayloadHandler({
    activeNodeId: args.activeNodeId,
    createHighlightFromPayload: args.selectionHandlers.handleCreateNoteFromPayload,
    editorRef: args.editorRef,
    nodesById: args.nodesById,
    onSelectNode: args.onSelectNode,
    trashedNodeIds: args.trashedNodeIds,
    updateNodeContent: args.updateNodeContent
  });
  const existingHighlightHandlers = createExistingHighlightHandlers(args);

  return buildEditorContextCommandsResult({
    closeContextMenu: args.closeContextMenu,
    contextMenu: args.contextMenu,
    handleCopyImage: imageHandlers.handleCopyImage,
    handleCreateCloze: args.selectionHandlers.handleCreateCloze,
    handleCreateClozeFromPayload: args.selectionHandlers.handleCreateClozeFromPayload,
    handleCreateHighlight: args.selectionHandlers.handleCreateHighlight,
    handleCreateHighlightFromPayload: args.selectionHandlers.handleCreateHighlightFromPayload,
    handleCreateNote: existingHighlightHandlers.handleCreateNote,
    handleToggleSelectionHighlightFromPayload,
    handleAddNoteToSelectionHighlightFromPayload,
    handleCreateNoteFromPayload: args.selectionHandlers.handleCreateNoteFromPayload,
    handleDeleteExistingHighlight: existingHighlightHandlers.handleDeleteExistingHighlight,
    handleCutImage: imageHandlers.handleCutImage,
    handleDeleteImage: imageHandlers.handleDeleteImage,
    handleEditorContextMenu: args.handleEditorContextMenu,
    handleExportImage: imageHandlers.handleExportImage
  });
}
