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

import type { LongClozeGuardOptions } from './editorClozeGuardrail';
import { resolveEditorRepairTableEdit, selectionFromRepairPayload } from './editorRepairTableCommand';
import { refreshSelectionHighlight } from './selectionHighlightRefresh';
import type { LocatorHighlightMatch } from './selectionHighlightToggleSupport';
import { resolveWebLookupTitle } from './webLookupTitle';

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
  handleCreateCloze: (options?: LongClozeGuardOptions) => void;
  handleCreateClozeFromPayload: (payload: SelectionCommandPayload, options?: LongClozeGuardOptions) => string | null;
  handleCreateHighlight: () => void;
  handleCreateHighlightFromPayload: (payload: SelectionCommandPayload) => string | null;
  handleCreateNote: (note: string) => void;
  handleOpenSelectionNote: () => void;
  handleRepairTable: () => boolean;
  handleToggleSelectionHighlightFromPayload: (payload: SelectionCommandPayload) => 'created' | 'deleted' | null;
  handleAddNoteToSelectionHighlightFromPayload: (payload: SelectionCommandPayload, note?: string) => string | null;
  handleCreateNoteFromPayload: (payload: SelectionCommandPayload, note?: string) => string | null;
  handleDeleteExistingHighlight: () => void;
  handleOpenExistingHighlight: () => void;
  handleCutImage: () => Promise<void>;
  handleDeleteImage: () => void;
  handleEditorContextMenu: (event: ReactMouseEvent<HTMLDivElement>) => void;
  handleExportImage: () => Promise<void>;
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
  args: {
    activeNodeId: string | null;
    contextMenu: Pick<SelectionContextMenuState, 'payload'> | null;
  },
  editorRef: MutableRefObject<EditorAdapter | null>,
  closeContextMenu: () => void
) {
  return (onApplied: (payload: SelectionCommandPayload) => void, anchorKind: 'highlight' | 'cloze') => {
    void anchorKind;
    const payload = args.contextMenu?.payload ?? (args.activeNodeId ? getSelectionCommandPayload(args.activeNodeId, editorRef.current) : null);
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
  nodesById: Record<string, Node>;
  setContextMenu: (value: EditorContextMenuState | null) => void;
}) {
  return (event: ReactMouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (args.isTrashViewOpen || !args.activeNodeId || !args.activeNode) {
      return;
    }

    const position = normalizeContextMenuPosition(event.clientX, event.clientY);
    const editorContent = args.editorRef.current?.getContent() ?? null;
    const livePayload = getSelectionCommandPayload(args.activeNodeId, args.editorRef.current);
    const commandPayload = livePayload ?? args.getPreservedSelectionPayload?.() ?? null;
    const clickPosition = args.editorRef.current?.getDocumentPositionAtClientPoint?.(event.clientX, event.clientY) ?? null;
    const repairSelection = selectionFromRepairPayload(commandPayload) ?? (clickPosition === null ? null : { from: clickPosition, to: clickPosition });
    const tableRepairSelection = repairSelection ? resolveEditorRepairTableEdit(args.editorRef.current, repairSelection) : null;
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
      repairTableAvailable: Boolean(tableRepairSelection),
      tableRepairSelection: tableRepairSelection ? repairSelection : null,
      top: position.top,
      webLookupDocumentText: editorContent,
      webLookupPayload: livePayload,
      webLookupTitle: resolveWebLookupTitle(args.activeNodeId, args.nodesById)
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
