import type { MutableRefObject } from 'react';

import type { EditorAdapter } from '../../features/editor/adapters/EditorAdapter';
import { getSelectionCommandPayloadForRanges } from '../contextCommands';

import { resolveCurrentParagraphSelection } from './immersiveReadingModel';

interface ImmersiveSelectionPayloadSource {
  activeNodeId: string | null;
  editorAdapterRef: MutableRefObject<EditorAdapter | null>;
}

export function resolveImmersiveSelectionPayload(args: {
  getReadingSelection: () => { from: number; to: number };
  props: ImmersiveSelectionPayloadSource;
}) {
  const editor = args.props.editorAdapterRef.current;
  if (!editor || !args.props.activeNodeId) {
    return null;
  }
  const editorSelection = editor.getSelection();
  const paragraphSelection = resolveCurrentParagraphSelection(
    editor.getContent(),
    editorSelection.from === editorSelection.to ? args.getReadingSelection() : editorSelection
  );
  if (!paragraphSelection) {
    return null;
  }
  editor.setSelection(paragraphSelection);
  editor.setSelectionRanges([paragraphSelection]);
  return getSelectionCommandPayloadForRanges(args.props.activeNodeId, editor, [paragraphSelection]);
}
