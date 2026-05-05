import { getSelectionCommandPayloadForRanges } from '../contextCommands';

import { resolveCurrentParagraphSelection } from './immersiveReadingModel';
import type { WorkspaceLayoutProps } from './WorkspaceLayout';

export function resolveImmersiveSelectionPayload(args: {
  getReadingSelection: () => { from: number; to: number };
  props: WorkspaceLayoutProps;
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
