import type { MouseEvent as ReactMouseEvent, MutableRefObject } from 'react';

import type { EditorAdapter } from '../../features/editor/adapters/EditorAdapter';
import type { Node } from '../../features/nodes/model/nodeTypes';
import { copyAttachmentImageToClipboard, exportAttachmentImage } from '../../shared/platform/attachmentImageActions';
import type { WorkspaceEditorContextMenu } from '../components/WorkspaceLayout';
import {
  getSelectionCommandPayload,
  getSelectionCommandPayloadForRanges,
  normalizeContextMenuPosition,
  type SelectionCommandPayload
} from '../contextCommands';
import { resolveImageContextMenuState, type ImageContextMenuState } from '../editorImageContextMenu';

import type { LocatorHighlightMatch } from './selectionHighlightToggleSupport';

export interface SelectionContextMenuState extends WorkspaceEditorContextMenu {
  existingHighlight?: LocatorHighlightMatch;
  kind: 'selection';
  payload: SelectionCommandPayload | null;
}

export type EditorContextMenuState = ImageContextMenuState | SelectionContextMenuState;

export interface EditorContextCommandsResult {
  closeContextMenu: () => void;
  contextMenu: EditorContextMenuState | null;
  handleCopyImage: () => Promise<void>;
  handleCreateCloze: () => void;
  handleCreateClozeFromPayload: (payload: SelectionCommandPayload) => string | null;
  handleCreateHighlight: () => void;
  handleCreateHighlightFromPayload: (payload: SelectionCommandPayload) => string | null;
  handleCreateNote: (note: string) => void;
  handleToggleSelectionHighlightFromPayload: (payload: SelectionCommandPayload) => 'created' | 'deleted' | null;
  handleAddNoteToSelectionHighlightFromPayload: (payload: SelectionCommandPayload, note?: string) => string | null;
  handleCreateNoteFromPayload: (payload: SelectionCommandPayload, note?: string) => string | null;
  handleDeleteExistingHighlight: () => void;
  handleCutImage: () => Promise<void>;
  handleDeleteImage: () => void;
  handleEditorContextMenu: (event: ReactMouseEvent<HTMLDivElement>) => void;
  handleExportImage: () => Promise<void>;
}

export function buildEditorContextCommandsResult(
  result: EditorContextCommandsResult
): EditorContextCommandsResult {
  return result;
}

function refreshSelectionHighlight(adapter: EditorAdapter | null) {
  if (!adapter) {
    return;
  }
  const selections = adapter.getSelectionRanges().filter((selection) => selection.from !== selection.to);
  if (selections.length === 0) {
    return;
  }
  requestAnimationFrame(() => {
    adapter.setSelectionRanges(selections);
    adapter.focus();
  });
}

function selectionPayloadOverlapsImage(
  payload: SelectionCommandPayload | null,
  imageRange: { from: number; to: number }
) {
  if (!payload) {
    return false;
  }
  return payload.entries.some((entry) => entry.range.from < imageRange.to && entry.range.to > imageRange.from);
}

export function createSelectionCommandRunner(
  contextMenu: Pick<SelectionContextMenuState, 'payload'> | null,
  editorRef: MutableRefObject<EditorAdapter | null>,
  closeContextMenu: () => void
) {
  return (onApplied: (payload: SelectionCommandPayload) => void, anchorKind: 'highlight' | 'cloze') => {
    void anchorKind;
    const payload = contextMenu?.payload;
    if (!payload || !editorRef.current || payload.entries.length === 0) {
      return;
    }
    onApplied(payload);
    closeContextMenu();
  };
}

export function createHandleEditorContextMenu(args: {
  activeNode?: Node;
  activeNodeId: string | null;
  editorRef: MutableRefObject<EditorAdapter | null>;
  getPreservedSelectionPayload?: () => SelectionCommandPayload | null;
  isTrashViewOpen: boolean;
  setContextMenu: (value: EditorContextMenuState) => void;
}) {
  return (event: ReactMouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (args.isTrashViewOpen || !args.activeNodeId || !args.activeNode) {
      return;
    }

    const position = normalizeContextMenuPosition(event.clientX, event.clientY);
    const commandPayload = getSelectionCommandPayload(args.activeNodeId, args.editorRef.current)
      ?? args.getPreservedSelectionPayload?.()
      ?? null;
    const imageContextMenu = resolveImageContextMenuState(event, position);
    if (imageContextMenu) {
      const fallbackPayload = getSelectionCommandPayloadForRanges(
        args.activeNodeId,
        args.editorRef.current,
        [imageContextMenu.imageRange]
      );
      args.setContextMenu({
        ...imageContextMenu,
        canRunCommands: Boolean(
          selectionPayloadOverlapsImage(commandPayload, imageContextMenu.imageRange) ? commandPayload : fallbackPayload
        ),
        payload: selectionPayloadOverlapsImage(commandPayload, imageContextMenu.imageRange) ? commandPayload : fallbackPayload
      });
      return;
    }

    args.setContextMenu({
      canRunCommands: !!commandPayload,
      kind: 'selection',
      left: position.left,
      mode: 'context-menu',
      payload: commandPayload,
      top: position.top
    });
    refreshSelectionHighlight(args.editorRef.current);
  };
}

export function createSyncActiveNodeContentFromEditor(
  activeNodeId: string | null,
  editorRef: MutableRefObject<EditorAdapter | null>,
  updateNodeContent: (nodeId: string, content: string) => void
) {
  return () => {
    if (!activeNodeId || !editorRef.current) {
      return;
    }
    updateNodeContent(activeNodeId, editorRef.current.getContent());
  };
}

function createRemoveImageSource(
  contextMenu: EditorContextMenuState | null,
  editorRef: MutableRefObject<EditorAdapter | null>,
  syncActiveNodeContentFromEditor: () => void
) {
  return () => {
    if (contextMenu?.kind !== 'image' || !editorRef.current) {
      return;
    }
    editorRef.current.replaceRange(contextMenu.imageRange.from, contextMenu.imageRange.to, '');
    syncActiveNodeContentFromEditor();
  };
}

function createHandleCopyImage(
  contextMenu: EditorContextMenuState | null,
  closeContextMenu: () => void
) {
  return async () => {
    if (contextMenu?.kind !== 'image') {
      return;
    }
    await copyAttachmentImageToClipboard(contextMenu.imageAttachmentId);
    closeContextMenu();
  };
}

function createHandleCutImage(
  contextMenu: EditorContextMenuState | null,
  closeContextMenu: () => void,
  removeImageSource: () => void
) {
  return async () => {
    if (contextMenu?.kind !== 'image') {
      return;
    }
    const result = await copyAttachmentImageToClipboard(contextMenu.imageAttachmentId);
    if (result?.status !== 'copied') {
      closeContextMenu();
      return;
    }
    removeImageSource();
    closeContextMenu();
  };
}

function createHandleExportImage(
  contextMenu: EditorContextMenuState | null,
  closeContextMenu: () => void
) {
  return async () => {
    if (contextMenu?.kind !== 'image') {
      return;
    }
    await exportAttachmentImage(contextMenu.imageAttachmentId);
    closeContextMenu();
  };
}

export function createImageCommandHandlers(args: {
  closeContextMenu: () => void;
  contextMenu: EditorContextMenuState | null;
  editorRef: MutableRefObject<EditorAdapter | null>;
  syncActiveNodeContentFromEditor: () => void;
}) {
  const removeImageSource = createRemoveImageSource(
    args.contextMenu,
    args.editorRef,
    args.syncActiveNodeContentFromEditor
  );

  return {
    handleCopyImage: createHandleCopyImage(args.contextMenu, args.closeContextMenu),
    handleCutImage: createHandleCutImage(args.contextMenu, args.closeContextMenu, removeImageSource),
    handleDeleteImage: () => (removeImageSource(), args.closeContextMenu()),
    handleExportImage: createHandleExportImage(args.contextMenu, args.closeContextMenu)
  };
}
