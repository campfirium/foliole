import type { MutableRefObject } from 'react';

import type { EditorAdapter } from '../../features/editor/adapters/EditorAdapter';
import { definedProps } from '../../shared/lib/definedProps';
import type { SelectionCommandPayload } from '../contextCommands';

import { runSelectionCommandFromPayload } from './editorSelectionCommandActions';

export function createPayloadSelectionRunner(
  closeContextMenu: () => void,
  editorRef: MutableRefObject<EditorAdapter | null>
) {
  return ({
    onApplied,
    payload,
    keepOpen
  }: {
    keepOpen?: boolean;
    onApplied: (payload: SelectionCommandPayload) => string | null;
    payload: SelectionCommandPayload;
  }) =>
    runSelectionCommandFromPayload({
      closeContextMenu,
      editorRef,
      onApplied,
      payload,
      ...definedProps({ keepOpen })
    });
}
