import type { Compartment } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';

import { dispatchReadOnlyReconfigure } from './codeMirrorEditorAdapterSupport';
import {
  applyDiffDecorations,
  applyExternalEditorContent,
  applySearchDecorations,
  replaceEditorRange
} from './codeMirrorEditorMutations';
import { applyTextAnchorDecorationsWithHighlightPreview, type HighlightRangePreview } from './codeMirrorHighlightRangePreview';
import { createCodeMirrorSelection } from './codeMirrorSelectionRanges';
import type { EditorSelection, EditorTextAnchorDecoration } from './EditorAdapter';

export function setCodeMirrorContent(args: {
  content: string;
  getContent: () => string;
  setApplyingExternalContent: (value: boolean) => void;
  view: EditorView;
}) {
  const currentContent = args.getContent();
  if (currentContent === args.content) return;
  args.setApplyingExternalContent(true);
  try {
    applyExternalEditorContent({ content: args.content, currentContent, view: args.view });
  } finally {
    args.setApplyingExternalContent(false);
  }
}

export function setCodeMirrorReadOnly(view: EditorView, compartment: Compartment, readOnly: boolean) {
  dispatchReadOnlyReconfigure({ compartment, readOnly, view });
}

export function setCodeMirrorSelectionRanges(
  view: EditorView,
  selections: EditorSelection[],
  clampPosition: (position: number) => number
) {
  view.dispatch({
    selection: createCodeMirrorSelection(selections, clampPosition),
    scrollIntoView: false
  });
}

export function replaceCodeMirrorRange(args: {
  content: string;
  from: number;
  to: number;
  view: EditorView;
}) {
  replaceEditorRange(args);
}

export function applyCodeMirrorTextAnchorDecorationsWithPreview(args: {
  compartment: Compartment;
  preview: HighlightRangePreview | null;
  textAnchorDecorations: readonly EditorTextAnchorDecoration[];
  view: EditorView;
}) {
  applyTextAnchorDecorationsWithHighlightPreview(args);
}

export function setCodeMirrorDiffDecorations(args: Parameters<typeof applyDiffDecorations>[0]) {
  applyDiffDecorations(args);
}

export function setCodeMirrorSearchDecorations(args: Parameters<typeof applySearchDecorations>[0]) {
  applySearchDecorations(args);
}
