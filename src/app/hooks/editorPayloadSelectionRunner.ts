import type { MutableRefObject } from 'react';

import type { EditorAdapter } from '../../features/editor/adapters/EditorAdapter';
import { definedProps } from '../../shared/lib/definedProps';
import type { SelectionCommandPayload } from '../contextCommands';

import { runSelectionCommandFromPayload } from './editorSelectionCommandPayload';

export function createPayloadSelectionRunner(
  closeContextMenu: () => void,
  editorRef: MutableRefObject<EditorAdapter | null>
) {
  return ({
    flushPendingEditorDraft,
    onApplied,
    payload,
    keepOpen
  }: {
    flushPendingEditorDraft: () => boolean;
    keepOpen?: boolean;
    onApplied: (payload: SelectionCommandPayload) => string | null;
    payload: SelectionCommandPayload;
  }) =>
    runSelectionCommandFromPayload({
      closeContextMenu,
      editorRef,
      flushPendingEditorDraft,
      onApplied,
      payload,
      ...definedProps({ keepOpen })
    });
}
