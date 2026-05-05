import { RangeSetBuilder } from '@codemirror/state';
import { Decoration, type DecorationSet, type EditorView } from '@codemirror/view';

import type { EditorTextAnchorDecoration } from './EditorAdapter';

interface TextAnchorCoverageSegment {
  activeClozeCount: number;
  activeHighlightCount: number;
  from: number;
  to: number;
}

function collectTextAnchorSegments(
  decorations: readonly EditorTextAnchorDecoration[],
  maxLength: number
): TextAnchorCoverageSegment[] {
  const boundaries = new Set<number>([0, maxLength]);
  const normalized = decorations
    .map((entry) => ({
      from: Math.max(0, Math.min(entry.from, maxLength)),
      kind: entry.kind,
      to: Math.max(0, Math.min(entry.to, maxLength))
    }))
    .filter((entry) => entry.to > entry.from);

  normalized.forEach((entry) => {
    boundaries.add(entry.from);
    boundaries.add(entry.to);
  });

  const orderedBoundaries = [...boundaries].sort((left, right) => left - right);
  const segments: TextAnchorCoverageSegment[] = [];
  for (let index = 0; index < orderedBoundaries.length - 1; index += 1) {
    const from = orderedBoundaries[index];
    const to = orderedBoundaries[index + 1];
    if (to <= from) {
      continue;
    }
    const covering = normalized.filter((entry) => entry.from < to && entry.to > from);
    if (covering.length === 0) {
      continue;
    }
    segments.push({
      activeClozeCount: covering.filter((entry) => entry.kind === 'cloze').length,
      activeHighlightCount: covering.filter((entry) => entry.kind === 'highlight').length,
      from,
      to
    });
  }
  return segments;
}

function addDecoration(
  builder: RangeSetBuilder<Decoration>,
  from: number,
  to: number,
  className: string
) {
  if (to <= from) {
    return;
  }
  builder.add(from, to, Decoration.mark({ class: className }));
}

export function buildEditorTextAnchorDecorations(
  view: EditorView,
  decorations: readonly EditorTextAnchorDecoration[] | null | undefined
): DecorationSet {
  if (!decorations || decorations.length === 0) {
    return Decoration.none;
  }

  const segments = collectTextAnchorSegments(decorations, view.state.doc.length);
  if (segments.length === 0) {
    return Decoration.none;
  }

  const builder = new RangeSetBuilder<Decoration>();
  segments.forEach((segment) => {
    if (segment.activeHighlightCount > 0) {
      addDecoration(
        builder,
        segment.from,
        segment.to,
        segment.activeHighlightCount > 1 ? 'cm-md-highlight-overlap' : 'cm-md-highlight'
      );
    }
    if (segment.activeClozeCount > 0) {
      addDecoration(builder, segment.from, segment.to, 'cm-md-cloze');
    }
    if (segment.activeHighlightCount + segment.activeClozeCount > 1 && segment.activeHighlightCount <= 1) {
      addDecoration(builder, segment.from, segment.to, 'cm-md-anchor-overlap');
    }
  });

  return builder.finish();
}
