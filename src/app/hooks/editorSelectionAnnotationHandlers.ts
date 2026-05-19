import type { MutableRefObject } from 'react';

import type { EditorAdapter } from '../../features/editor/adapters/EditorAdapter';
import type { Node } from '../../features/nodes/model/nodeTypes';

import type { createSelectionHandlers } from './editorSelectionCommandActions';
import { createOpenSelectionNotePanel } from './editorSelectionNotePanelCommand';
import {
  createAddNoteToSelectionHighlightFromPayloadHandler,
  createToggleSelectionHighlightFromPayloadHandler
} from './selectionHighlightToggle';
import type { EditorContextMenuState } from './useEditorContextCommandHelpers';

export function createSelectionAnnotationHandlers(args: {
  activeNodeId: string | null;
  deleteNodePermanently: (nodeId: string) => void;
  editorRef: MutableRefObject<EditorAdapter | null>;
  nodesById: Record<string, Node>;
  onSelectNode: (nodeId: string) => void;
  selectionHandlers: ReturnType<typeof createSelectionHandlers>;
  setContextMenu: (value: EditorContextMenuState | null) => void;
  trashedNodeIds: string[];
  syncActiveNodeContentFromEditor: () => void;
  updateNodeContent: (nodeId: string, content: string) => void;
}) {
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

  return {
    handleOpenSelectionNote: createOpenSelectionNotePanel({
      activeNodeId: args.activeNodeId,
      editorRef: args.editorRef,
      setContextMenu: args.setContextMenu
    }),
    handleToggleSelectionHighlightFromPayload,
    handleAddNoteToSelectionHighlightFromPayload
  };
}
