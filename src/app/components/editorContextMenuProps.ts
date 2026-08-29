import type { SelectionCommandPayload } from '../contextCommands';
import type { LongClozeGuardOptions } from '../hooks/editorClozeGuardrail';

export interface EditorContextMenuProps {
  existingNote?: string | null;
  kind: 'image' | 'selection';
  left: number;
  initialNoteOpen?: boolean;
  mode?: 'annotation-toolbar' | 'context-menu' | 'existing-highlight-toolbar';
  notePanelLeft?: number;
  notePanelTop?: number;
  repairTableAvailable?: boolean;
  selectionPayload?: SelectionCommandPayload | null | undefined;
  top: number;
  webLookupDocumentText?: string | null | undefined;
  webLookupPayload?: SelectionCommandPayload | null | undefined;
  webLookupTitle?: string | null | undefined;
  onClose: () => void;
  onCopyImage: () => void;
  onCreateHighlight: () => void;
  onCreateNote: (note: string) => boolean | Promise<boolean> | void;
  onDeleteExistingHighlight: () => void;
  onOpenExistingHighlight: () => void;
  onRepairTable?: () => void;
  onCreateCloze: (options?: LongClozeGuardOptions) => void;
  onCreateClozeFromPayload: (payload: SelectionCommandPayload, options?: LongClozeGuardOptions) => string | null;
  onCreateHighlightFromPayload: (payload: SelectionCommandPayload) => string | null;
  onCutImage: () => void;
  onDeleteImage: () => void;
  onExportImage: () => void;
}
