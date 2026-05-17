import { appendHighlightCardNote } from '../../../lib/core/annotations/textAnnotationContent';
import { getHighlightAnnotationPrefix } from '../../features/editor/model/highlightAnnotationPrefixSetting';
import type { Node } from '../../features/nodes/model/nodeTypes';

import type { createSelectionHandlers } from './editorSelectionCommandActions';
import type { EditorContextMenuState } from './useEditorContextCommandHelpers';

interface ExistingHighlightHandlerArgs {
  closeContextMenu: () => void;
  contextMenu: EditorContextMenuState | null;
  deleteNodePermanently: (nodeId: string) => void;
  nodesById: Record<string, Node>;
  onSelectNode: (nodeId: string) => void;
  selectionHandlers: ReturnType<typeof createSelectionHandlers>;
  updateNodeContent: (nodeId: string, content: string) => void;
}

export function createExistingHighlightHandlers(args: ExistingHighlightHandlerArgs) {
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
