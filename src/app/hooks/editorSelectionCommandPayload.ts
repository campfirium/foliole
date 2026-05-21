import type { MutableRefObject } from 'react';

import type { EditorAdapter } from '../../features/editor/adapters/EditorAdapter';
import type { SelectionCommandPayload } from '../contextCommands';

export function runSelectionCommandFromPayload(args: {
  closeContextMenu?: () => void;
  editorRef: MutableRefObject<EditorAdapter | null>;
  flushPendingEditorDraft: () => boolean;
  keepOpen?: boolean;
  onApplied: (payload: SelectionCommandPayload) => string | null;
  payload: SelectionCommandPayload;
}) {
  if (!args.editorRef.current || args.payload.entries.length === 0) {
    args.closeContextMenu?.();
    return null;
  }
  args.flushPendingEditorDraft();
  const createdNodeId = args.onApplied(args.payload);
  if (!args.keepOpen) {
    args.closeContextMenu?.();
  }
  return createdNodeId;
}
