import { applyTextAnchorDecorations } from './codeMirrorEditorMutations';
import type { EditorTextAnchorDecoration } from './EditorAdapter';

export function applyEditorTextAnchorDecorations(args: {
  compartment: import('@codemirror/state').Compartment;
  textAnchorDecorations: readonly EditorTextAnchorDecoration[];
  view: import('@codemirror/view').EditorView;
}) {
  applyTextAnchorDecorations({
    compartment: args.compartment,
    textAnchorDecorations: args.textAnchorDecorations,
    view: args.view
  });
}
