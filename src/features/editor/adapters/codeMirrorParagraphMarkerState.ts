import { type Compartment } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { reconfigureDecorationCompartment } from './codeMirrorEditorAdapterView';
import type { EditorSelection } from './EditorAdapter';
import { buildParagraphMarkerDecorations } from './paragraphMarkerDecorations';

const viewsWithParagraphMarkers = new WeakSet<EditorView>();

export function syncParagraphMarkerSelectionVisibility(view: EditorView) {
  const hasExplicitSelection = view.state.selection?.ranges.some((range) => !range.empty) ?? false;
  view.dom.dataset.paragraphMarkerActive = viewsWithParagraphMarkers.has(view) && !hasExplicitSelection
    ? 'true'
    : 'false';
}

export function applyParagraphMarkerState(args: {
  compartment: Compartment;
  selection: EditorSelection | null;
  view: EditorView;
}) {
  if (args.selection) {
    viewsWithParagraphMarkers.add(args.view);
  } else {
    viewsWithParagraphMarkers.delete(args.view);
  }
  syncParagraphMarkerSelectionVisibility(args.view);
  reconfigureDecorationCompartment({
    buildDecorations: () => EditorView.decorations.of(buildParagraphMarkerDecorations(args.view, args.selection)),
    compartment: args.compartment,
    fallbackLabel: '[editor] failed to apply paragraph marker decorations, falling back to plain selection',
    view: args.view
  });
}
