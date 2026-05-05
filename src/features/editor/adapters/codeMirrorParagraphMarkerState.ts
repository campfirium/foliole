import { type Compartment } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { reconfigureDecorationCompartment } from './codeMirrorEditorAdapterView';
import type { EditorSelection } from './EditorAdapter';
import { buildParagraphMarkerDecorations } from './paragraphMarkerDecorations';

export function applyParagraphMarkerState(args: {
  compartment: Compartment;
  selection: EditorSelection | null;
  view: EditorView;
}) {
  args.view.dom.dataset.paragraphMarkerActive = args.selection ? 'true' : 'false';
  reconfigureDecorationCompartment({
    buildDecorations: () => EditorView.decorations.of(buildParagraphMarkerDecorations(args.view, args.selection)),
    compartment: args.compartment,
    fallbackLabel: '[editor] failed to apply paragraph marker decorations, falling back to plain selection',
    view: args.view
  });
}
