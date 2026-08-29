import { replaceExcerptAnnotation } from '../../../lib/core/annotations/textAnnotationContent';
import { getHighlightAnnotationPrefix } from '../../features/editor/model/highlightAnnotationPrefixSetting';
import type { Node } from '../../features/nodes/model/nodeTypes';

import type { createSelectionHandlers } from './editorSelectionCommandActions';
import type { EditorContextMenuState } from './useEditorContextCommandHelpers';

interface ExistingHighlightHandlerArgs {
  closeContextMenu: () => void;
  contextMenu: EditorContextMenuState | null;
  deleteEditorAnnotationNodes: (nodeIds: string[]) => void;
  flushPendingEditorDraft: () => boolean;
  nodesById: Record<string, Node>;
  onSelectNode: (nodeId: string) => void;
  selectionHandlers: ReturnType<typeof createSelectionHandlers>;
  updateNodeContent: (
    nodeId: string,
    content: string,
    options?: { preserveTitle?: boolean; publishLocal?: boolean }
  ) => Promise<boolean>;
}

export function createExistingHighlightHandlers(args: ExistingHighlightHandlerArgs) {
  const existingHighlight = args.contextMenu?.kind === 'selection' ? args.contextMenu.existingHighlight : null;
  return {
    handleCreateNote(note: string) {
      if (!note.trim()) {
        return false;
      }
      if (!existingHighlight) {
        args.selectionHandlers.handleCreateNote(note);
        return false;
      }
      const node = args.nodesById[existingHighlight.nodeId];
      if (!node) {
        return false;
      }
      args.flushPendingEditorDraft();
      return args.updateNodeContent(existingHighlight.nodeId, replaceExcerptAnnotation({
        content: node.content,
        note,
        notePrefix: getHighlightAnnotationPrefix()
      }), { preserveTitle: true });
    },
    handleDeleteExistingHighlight() {
      if (!existingHighlight) {
        return;
      }
      args.flushPendingEditorDraft();
      args.deleteEditorAnnotationNodes([existingHighlight.nodeId]);
      args.closeContextMenu();
    },
    handleOpenExistingHighlight() {
      if (!existingHighlight || !args.nodesById[existingHighlight.nodeId]) {
        return;
      }
      args.onSelectNode(existingHighlight.nodeId);
      args.closeContextMenu();
    }
  };
}
