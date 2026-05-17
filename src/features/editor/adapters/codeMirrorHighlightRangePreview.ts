import type { Compartment } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';

import { applyAdapterTextAnchorDecorations } from './codeMirrorEditorAdapterPresentation';
import type { EditorSelection, EditorTextAnchorDecoration } from './EditorAdapter';

export interface HighlightRangePreview {
  nodeId: string;
  range: EditorSelection;
}

export function resolveTextAnchorDecorationsWithHighlightPreview(args: {
  preview: HighlightRangePreview | null;
  textAnchorDecorations: readonly EditorTextAnchorDecoration[];
}) {
  if (!args.preview) {
    return args.textAnchorDecorations;
  }
  const preview = args.preview;
  return args.textAnchorDecorations.map((decoration) => {
    if (decoration.kind !== 'highlight' || decoration.nodeId !== preview.nodeId) {
      return decoration;
    }
    return {
      ...decoration,
      from: preview.range.from,
      to: preview.range.to
    };
  });
}

export function applyTextAnchorDecorationsWithHighlightPreview(args: {
  compartment: Compartment;
  preview: HighlightRangePreview | null;
  textAnchorDecorations: readonly EditorTextAnchorDecoration[];
  view: EditorView;
}) {
  applyAdapterTextAnchorDecorations({
    compartment: args.compartment,
    textAnchorDecorations: resolveTextAnchorDecorationsWithHighlightPreview(args),
    view: args.view
  });
}
