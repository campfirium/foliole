import { type Range } from '@codemirror/state';
import { Decoration, type DecorationSet, type EditorView, type ViewUpdate } from '@codemirror/view';

import { buildFrontmatterDecorationState, type FrontmatterDecorationState } from './liveMarkdownFrontmatter';

export interface StaticDecorationParts {
  frontmatterState: FrontmatterDecorationState;
}

export function buildStaticDecorationParts(view: EditorView): StaticDecorationParts {
  return {
    frontmatterState: buildFrontmatterDecorationState(view)
  };
}

export function mergeDecorationSets(docLength: number, ...sets: DecorationSet[]) {
  const ranges: Range<Decoration>[] = [];

  for (const set of sets) {
    set.between(0, docLength, (from, to, decoration) => {
      ranges.push(decoration.range(from, to));
    });
  }

  return Decoration.set(ranges, true);
}

export function shouldRebuildFrontmatter(update: ViewUpdate, inspectedUntilLine: number) {
  let shouldRebuild = false;
  update.changes.iterChangedRanges((fromA) => {
    if (shouldRebuild) return;
    shouldRebuild = update.startState.doc.lineAt(fromA).number <= inspectedUntilLine;
  });
  return shouldRebuild;
}

export function updateFrontmatterDecorationState(
  update: ViewUpdate,
  state: FrontmatterDecorationState
): FrontmatterDecorationState {
  if (shouldRebuildFrontmatter(update, state.inspectedUntilLine)) {
    return buildFrontmatterDecorationState(update.view);
  }

  return {
    ...state,
    decorations: state.decorations.map(update.changes)
  };
}
