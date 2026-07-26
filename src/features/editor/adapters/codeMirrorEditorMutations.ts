import { Transaction, type Compartment } from '@codemirror/state';
import { Decoration, EditorView } from '@codemirror/view';

import { reconfigureDecorationCompartment } from './codeMirrorEditorAdapterView';
import { updateTextAnchorDecorations } from './codeMirrorTextAnchorState';
import type { EditorSearchDecorations } from './EditorAdapter';
import type { EditorTextAnchorDecoration } from './EditorAdapter';
import {
  buildEditorDiffDecorations,
  setEditorDiffDecorationsEffect,
  type EditorDiffDecorations
} from './lineDiffDecorations';
import { buildEditorSearchDecorations } from './searchDecorations';

export function applyExternalEditorContent(args: {
  content: string;
  currentContent: string;
  view: EditorView;
}) {
  args.view.dispatch({
    annotations: Transaction.addToHistory.of(false),
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
    changes: { from: args.from, to: args.to, insert: args.content },
    selection: { anchor: args.from + args.content.length }
  });
}

export function applyDiffDecorations(args: {
  diffDecorations: EditorDiffDecorations | null;
  view: EditorView;
}) {
  try {
    args.view.dispatch({
      effects: setEditorDiffDecorationsEffect.of(buildEditorDiffDecorations(args.view, args.diffDecorations))
    });
  } catch (error) {
    console.error('[editor] failed to apply diff decorations, falling back to plain view', error);
    args.view.dispatch({ effects: setEditorDiffDecorationsEffect.of(Decoration.none) });
  }
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

export function applyTextAnchorDecorations(args: {
  compartment: Compartment;
  textAnchorDecorations: readonly EditorTextAnchorDecoration[] | null;
  view: EditorView;
}) {
  updateTextAnchorDecorations({
    textAnchorDecorations: args.textAnchorDecorations ?? [],
    view: args.view
  });
}
