import { definedProps } from '../../shared/lib/definedProps';
import type { SelectionCommandPayload } from '../contextCommands';
import type { LongClozeGuardOptions } from '../hooks/editorClozeGuardrail';

import { EditorContextMenu } from './EditorContextMenu';
import type { WorkspaceEditorContextMenu } from './WorkspaceLayout';

interface DocumentPanelContextMenuProps {
  contextMenu: WorkspaceEditorContextMenu | null;
  onCloseContextMenu: () => void;
  onCopyImage: () => void;
  onCreateHighlight: () => void;
  onCreateNote: (note: string) => void;
  onDeleteExistingHighlight: () => void;
  onOpenExistingHighlight: () => void;
  onCreateCloze: (options?: LongClozeGuardOptions) => void;
  onCreateClozeFromPayload?: (payload: SelectionCommandPayload, options?: LongClozeGuardOptions) => string | null;
  onCreateHighlightFromPayload?: (payload: SelectionCommandPayload) => string | null;
  onCutImage: () => void;
  onDeleteImage: () => void;
  onExportImage: () => void;
}

export function DocumentPanelContextMenu({
  contextMenu,
  onCloseContextMenu,
  onCopyImage,
  onCreateHighlight,
  onCreateNote,
  onDeleteExistingHighlight,
  onOpenExistingHighlight,
  onCreateCloze,
  onCreateClozeFromPayload,
  onCreateHighlightFromPayload,
  onCutImage,
  onDeleteImage,
  onExportImage
}: DocumentPanelContextMenuProps) {
  if (!contextMenu) {
    return null;
  }

  return (
    <EditorContextMenu
      kind={contextMenu.kind}
      left={contextMenu.left}
      {...definedProps({
        mode: contextMenu.mode,
        initialNoteOpen: contextMenu.initialNoteOpen,
        notePanelLeft: contextMenu.notePanelLeft,
        notePanelTop: contextMenu.notePanelTop
      })}
      onClose={onCloseContextMenu}
      onCopyImage={onCopyImage}
      onCreateCloze={onCreateCloze}
      onCreateClozeFromPayload={onCreateClozeFromPayload ?? (() => null)}
      onCreateHighlight={onCreateHighlight}
      onCreateHighlightFromPayload={onCreateHighlightFromPayload ?? (() => null)}
      onCreateNote={onCreateNote}
      onDeleteExistingHighlight={onDeleteExistingHighlight}
      onOpenExistingHighlight={onOpenExistingHighlight}
      onCutImage={onCutImage}
      onDeleteImage={onDeleteImage}
      onExportImage={onExportImage}
      selectionPayload={contextMenu.payload}
      top={contextMenu.top}
      webLookupDocumentText={contextMenu.webLookupDocumentText}
      webLookupPayload={contextMenu.webLookupPayload}
    />
  );
}
