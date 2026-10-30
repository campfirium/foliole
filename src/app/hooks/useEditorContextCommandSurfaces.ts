import { definedProps } from '../../shared/lib/definedProps';
import { canCreateSelectionAnnotation } from '../../shared/selectionAnnotationEligibility';

import type { EditorContextMenuState } from './useEditorContextCommandHelpers';
import type { UseEditorContextCommandsParams } from './useEditorContextCommands';
import { useFormulaClozeEventBridge } from './useFormulaClozeEventBridge';
import { useImageClozeEventBridge } from './useImageClozeEventBridge';
import { useSelectionAnnotationToolbar } from './useSelectionAnnotationToolbar';

export function useEditorContextCommandSurfaces(
  args: UseEditorContextCommandsParams,
  setContextMenu: (value: EditorContextMenuState | null) => void
) {
  const canAnnotate = canCreateSelectionAnnotation(args.activeNodeId ? args.nodesById[args.activeNodeId] : null);
  const createFormulaClozeNode = canAnnotate ? args.createFormulaClozeNode ?? (async () => null) : async () => null;
  const createImageClozeNodes = canAnnotate ? args.createImageClozeNodes ?? (async () => []) : async () => [];
  useSelectionAnnotationToolbar({
    activeNodeId: args.activeNodeId,
    editorRef: args.editorRef,
    isTrashViewOpen: args.isTrashViewOpen,
    nodesById: args.nodesById,
    selectionToolbarEnabled: canAnnotate && (args.selectionToolbarEnabled ?? true),
    setContextMenu,
    trashedNodeIds: args.trashedNodeIds
  });
  useFormulaClozeEventBridge({
    activeNodeId: args.activeNodeId,
    createFormulaClozeNode,
    editorRef: args.editorRef,
    flushPendingEditorDraft: args.flushPendingEditorDraft,
    ...definedProps({ activeNode: args.activeNode })
  });
  useImageClozeEventBridge({
    activeNodeId: args.activeNodeId,
    createImageClozeNodes,
    deleteImageClozeRegion: args.deleteImageClozeRegion,
    editorRef: args.editorRef,
    flushPendingEditorDraft: args.flushPendingEditorDraft,
    nodesById: args.nodesById,
    ...definedProps({ activeNode: args.activeNode })
  });
}
