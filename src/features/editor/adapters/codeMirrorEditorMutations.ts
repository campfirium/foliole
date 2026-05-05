import { type Compartment } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { bypassAnchorStructureGuard } from './anchorStructureGuard';
import { reconfigureDecorationCompartment } from './codeMirrorEditorAdapterView';
import type { EditorSearchDecorations } from './EditorAdapter';
import { buildEditorDiffDecorations, type EditorDiffDecorations } from './lineDiffDecorations';
import { buildEditorSearchDecorations } from './searchDecorations';

export function applyExternalEditorContent(args: {
  content: string;
  currentContent: string;
  view: EditorView;
}) {
  args.view.dispatch({
    annotations: bypassAnchorStructureGuard.of(true),
    changes: { from: 0, to: args.currentContent.length, insert: args.content }
  });
}

export function replaceEditorRange(args: {
  content: string;
  from: number;
  to: number;
  view: EditorView;
}) {
  args.view.dispatch({
    annotations: bypassAnchorStructureGuard.of(true),
    changes: { from: args.from, to: args.to, insert: args.content },
    selection: { anchor: args.from + args.content.length }
  });
}

export function applyDiffDecorations(args: {
  compartment: Compartment;
  diffDecorations: EditorDiffDecorations | null;
  view: EditorView;
}) {
  reconfigureDecorationCompartment({
    buildDecorations: () => EditorView.decorations.of(buildEditorDiffDecorations(args.view, args.diffDecorations)),
    compartment: args.compartment,
    fallbackLabel: '[editor] failed to apply diff decorations, falling back to plain view',
    view: args.view
  });
}

export function applySearchDecorations(args: {
  compartment: Compartment;
  searchDecorations: EditorSearchDecorations | null;
  view: EditorView;
}) {
  reconfigureDecorationCompartment({
    buildDecorations: () => EditorView.decorations.of(buildEditorSearchDecorations(args.view, args.searchDecorations)),
    compartment: args.compartment,
    fallbackLabel: '[editor] failed to apply search decorations, falling back to plain view',
    view: args.view
  });
}
