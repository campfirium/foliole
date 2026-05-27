import { type Range } from '@codemirror/state';
import { Decoration, type EditorView } from '@codemirror/view';

import { collectMarkdownMathRangesFromTree } from '../model/markdownMathRanges';

import type { collectCodeFenceProjection } from './liveMarkdownDecorationCollections';
import { addMathDecorations } from './liveMarkdownMath';
import type { EditedMathRange } from './liveMarkdownMathEditState';
import {
  addMermaidDecorations,
  collectBareMermaidBlocks,
  collectFencedMermaidBlocks,
  collectMermaidLineFroms
} from './liveMarkdownMermaid';

interface PreviewBlockDecorationContext {
  editedMathRange: EditedMathRange | null;
  imageClozePresentationVersion: number;
  nodeId: string | null;
}

export function addPreviewBlockDecorations(
  ranges: Range<Decoration>[],
  args: {
    codeFenceProjection: ReturnType<typeof collectCodeFenceProjection>;
    context: PreviewBlockDecorationContext;
    mathRanges: ReturnType<typeof collectMarkdownMathRangesFromTree>;
    source: string;
    view: EditorView;
  }
) {
  addMathDecorations(
    ranges,
    args.mathRanges,
    args.view,
    args.context.editedMathRange,
    args.context.nodeId,
    args.context.imageClozePresentationVersion
  );
  addMermaidDecorations(
    ranges,
    args.source,
    [...collectFencedMermaidBlocks(args.source, args.codeFenceProjection.codeBlocks), ...collectBareMermaidBlocks(args.source, args.view)],
    args.view
  );
}

export function collectPreviewMermaidLineFroms(
  source: string,
  codeFenceProjection: ReturnType<typeof collectCodeFenceProjection>,
  view: EditorView
) {
  return collectMermaidLineFroms(
    [...collectFencedMermaidBlocks(source, codeFenceProjection.codeBlocks), ...collectBareMermaidBlocks(source, view)],
    view
  );
}
