import { useEffect, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';

import type { EditorAdapter } from '../../features/editor/adapters/EditorAdapter';
import type { FormulaClozeCreatePayload, FormulaClozeSourcePayload } from '../../features/formula-cloze/model/formulaCloze';
import type { ImageClozeDraftRegion, ImageClozeSourcePayload } from '../../features/image-cloze/model/imageCloze';
import type { Node, NodeAnchorLink } from '../../features/nodes/model/nodeTypes';
import { definedProps } from '../../shared/lib/definedProps';
import { getSelectionCommandPayload, type SelectionCommandPayload } from '../contextCommands';

import { createPayloadSelectionRunner } from './editorPayloadSelectionRunner';
import { repairEditorTable } from './editorRepairTableCommand';
import { createSelectionAnnotationHandlers } from './editorSelectionAnnotationHandlers';
import { createSelectionHandlers } from './editorSelectionCommandActions';
import { createExistingHighlightHandlers } from './existingHighlightContextHandlers';
import {
  createHandleEditorContextMenu,
  createImageCommandHandlers,
  createSelectionCommandRunner,
  createSyncActiveNodeContentFromEditor,
  type EditorContextMenuState
} from './useEditorContextCommandHelpers';
import { useEditorContextCommandSurfaces } from './useEditorContextCommandSurfaces';

type MaybePromise<T> = T | Promise<T>;

export interface UseEditorContextCommandsParams {
  activeNode?: Node;
  activeNodeId: string | null;
  createChildNode: (parentNodeId: string, content?: string) => MaybePromise<string | null>;
  createHighlightNodeFromSelection: (
    parentNodeId: string,
    selectionText: string,
    anchorId: string,
    anchorLink?: NodeAnchorLink,
    imageRegions?: import('../../features/nodes/model/nodeTypes').NodeImageRegionGroup[] | null
  ) => MaybePromise<string | null>;
  createImageClozeNodes?: (
    parentNodeId: string,
    attachmentId: string,
    sourcePayload: ImageClozeSourcePayload,
    regions: ImageClozeDraftRegion[]
  ) => MaybePromise<string[]>;
  createFormulaClozeNode?: (
    parentNodeId: string,
    payload: FormulaClozeCreatePayload,
    sourcePayload: FormulaClozeSourcePayload
  ) => MaybePromise<string | null>;
  createQANodeFromSelection: (
    parentNodeId: string,
    clozeContent: string,
    answer: string,
    anchorId: string,
    anchorLink?: NodeAnchorLink
  ) => MaybePromise<string | null>;
  deleteEditorAnnotationNodes: (nodeIds: string[]) => void;
  deleteImageClozeRegion: (parentNodeId: string, attachmentId: string, regionId: string) => void;
  editorRef: MutableRefObject<EditorAdapter | null>;
  flushPendingEditorDraft: () => boolean;
  isTrashViewOpen: boolean;
  trashedNodeIds: string[];
  nodesById: Record<string, Node>;
  onExitImmersiveMode: () => void;
  onSelectNode: (nodeId: string) => void;
  selectionToolbarEnabled?: boolean;
  updateNodeContent: (
    nodeId: string,
    content: string,
    options?: { preserveTitle?: boolean; publishLocal?: boolean }
  ) => Promise<boolean>;
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

export function useEditorContextCommands(args: UseEditorContextCommandsParams) {
  const [contextMenu, setContextMenu] = useState<EditorContextMenuState | null>(null);
  const { activeNodeId, editorRef } = args;
  const preservedSelectionPayloadRef = usePreservedSelectionPayload({ activeNodeId, editorRef });
  useEditorContextCommandSurfaces(args, setContextMenu);
  const closeContextMenu = () => setContextMenu(null);
  const syncActiveNodeContentFromEditor = createSyncActiveNodeContentFromEditor(activeNodeId, editorRef, args.updateNodeContent);
  const handleEditorContextMenu = createHandleEditorContextMenu({
    activeNodeId,
    editorRef,
    getPreservedSelectionPayload: () => preservedSelectionPayloadRef.current,
    isTrashViewOpen: args.isTrashViewOpen,
    nodesById: args.nodesById,
    setContextMenu,
    ...definedProps({ activeNode: args.activeNode })
  });
  const runSelectionCommand = createSelectionCommandRunner({ activeNodeId, contextMenu: contextMenu ? { payload: contextMenu.payload } : null }, editorRef, closeContextMenu);
  const runSelectionCommandFromPayloadHandler = createPayloadSelectionRunner(closeContextMenu, editorRef);
  const selectionHandlers = createSelectionHandlers({
    createChildNode: args.createChildNode,
    createHighlightNodeFromSelection: args.createHighlightNodeFromSelection,
    createQANodeFromSelection: args.createQANodeFromSelection,
    flushPendingEditorDraft: args.flushPendingEditorDraft,
    onExitImmersiveMode: args.onExitImmersiveMode,
    onSelectNode: args.onSelectNode,
    runSelectionCommand,
    runSelectionCommandFromPayloadHandler
  });
  return buildEditorCommandsResult({
    activeNodeId,
    closeContextMenu,
    contextMenu,
    deleteEditorAnnotationNodes: args.deleteEditorAnnotationNodes,
    editorRef,
    flushPendingEditorDraft: args.flushPendingEditorDraft,
    handleEditorContextMenu,
    nodesById: args.nodesById,
    onSelectNode: args.onSelectNode,
    selectionHandlers,
    setContextMenu,
    trashedNodeIds: args.trashedNodeIds,
    syncActiveNodeContentFromEditor,
    updateNodeContent: args.updateNodeContent
  });
}

function buildEditorCommandsResult(args: {
  activeNodeId: string | null;
  closeContextMenu: () => void;
  contextMenu: EditorContextMenuState | null;
  deleteEditorAnnotationNodes: (nodeIds: string[]) => void;
  editorRef: MutableRefObject<EditorAdapter | null>;
  flushPendingEditorDraft: () => boolean;
  handleEditorContextMenu: ReturnType<typeof createHandleEditorContextMenu>;
  nodesById: Record<string, Node>;
  onSelectNode: (nodeId: string) => void;
  selectionHandlers: ReturnType<typeof createSelectionHandlers>;
  setContextMenu: (value: EditorContextMenuState | null) => void;
  trashedNodeIds: string[];
  syncActiveNodeContentFromEditor: () => void;
  updateNodeContent: (
    nodeId: string,
    content: string,
    options?: { preserveTitle?: boolean; publishLocal?: boolean }
  ) => Promise<boolean>;
}) {
  const imageHandlers = createImageCommandHandlers({
    closeContextMenu: args.closeContextMenu,
    contextMenu: args.contextMenu,
    editorRef: args.editorRef,
    syncActiveNodeContentFromEditor: args.syncActiveNodeContentFromEditor
  });
  const selectionAnnotationHandlers = createSelectionAnnotationHandlers(args);
  const existingHighlightHandlers = createExistingHighlightHandlers(args);

  return {
    closeContextMenu: args.closeContextMenu,
    contextMenu: args.contextMenu,
    handleCopyImage: imageHandlers.handleCopyImage,
    handleCreateCloze: args.selectionHandlers.handleCreateCloze,
    handleCreateClozeFromPayload: args.selectionHandlers.handleCreateClozeFromPayload,
    handleCreateHighlight: args.selectionHandlers.handleCreateHighlight,
    handleCreateHighlightFromPayload: args.selectionHandlers.handleCreateHighlightFromPayload,
    handleCreateNote: existingHighlightHandlers.handleCreateNote,
    ...selectionAnnotationHandlers,
    handleCreateNoteFromPayload: args.selectionHandlers.handleCreateNoteFromPayload,
    handleDeleteExistingHighlight: existingHighlightHandlers.handleDeleteExistingHighlight,
    handleOpenExistingHighlight: existingHighlightHandlers.handleOpenExistingHighlight,
    handleRepairTable: () => {
      const repaired = repairEditorTable({
        activeNodeId: args.activeNodeId,
        editorRef: args.editorRef,
        ...definedProps({
          selection: args.contextMenu?.kind === 'selection' ? args.contextMenu.tableRepairSelection : null
        }),
        updateNodeContent: args.updateNodeContent
      });
      if (repaired) args.closeContextMenu();
      return repaired;
    },
    handleCutImage: imageHandlers.handleCutImage,
    handleDeleteImage: imageHandlers.handleDeleteImage,
    handleEditorContextMenu: args.handleEditorContextMenu,
    handleExportImage: imageHandlers.handleExportImage
  };
}
