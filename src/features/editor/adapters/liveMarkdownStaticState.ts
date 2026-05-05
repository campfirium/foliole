import { type Range } from '@codemirror/state';
import { Decoration, type DecorationSet, type EditorView, type ViewUpdate } from '@codemirror/view';

import { hasInlineAnchorMarkup } from '../model/anchorBlocks';
import {
  buildAnchorDecorationStatePlan,
  shouldRebuildAnchorDecorationState
} from '../model/anchorDecorationState';
import { getEditorDisplayMode } from '../model/editorDisplayMode';

import { buildFrontmatterDecorationState, type FrontmatterDecorationState } from './liveMarkdownFrontmatter';
import { addMark, addReplace } from './liveMarkdownPrimitives';
import { getHiddenInlineAnchorKeys } from './liveMarkdownState';

export interface AnchorDecorationState {
  decorations: DecorationSet;
  sensitiveRanges: Array<{ from: number; to: number }>;
}

export interface StaticDecorationParts {
  anchorState: AnchorDecorationState;
  frontmatterState: FrontmatterDecorationState;
}

function buildAnchorDecorations(plan: ReturnType<typeof buildAnchorDecorationStatePlan>['plan']) {
  const ranges: Range<Decoration>[] = [];
  for (const range of plan.replaceRanges) addReplace(ranges, range.from, range.to);
  for (const range of plan.markRanges) addMark(ranges, range.from, range.to, range.className);
  return Decoration.set(ranges, true);
}

export function buildPreviewAnchorDecorationState(view: EditorView): AnchorDecorationState {
  const content = view.state.doc.toString();
  if (!hasInlineAnchorMarkup(content)) {
    return {
      decorations: Decoration.none,
      sensitiveRanges: []
    };
  }
  const statePlan = buildAnchorDecorationStatePlan({
    content,
    displayMode: 'preview',
    hiddenAnchorKeys: new Set(getHiddenInlineAnchorKeys(view))
  });
  return {
    decorations: buildAnchorDecorations(statePlan.plan),
    sensitiveRanges: statePlan.sensitiveRanges
  };
}

export function buildSourceModeAnchorDecorationState(view: EditorView): AnchorDecorationState {
  const content = view.state.doc.toString();
  if (!hasInlineAnchorMarkup(content)) {
    return {
      decorations: Decoration.none,
      sensitiveRanges: []
    };
  }
  const statePlan = buildAnchorDecorationStatePlan({
    content,
    displayMode: 'source'
  });
  return {
    decorations: buildAnchorDecorations(statePlan.plan),
    sensitiveRanges: statePlan.sensitiveRanges
  };
}

export function buildStaticDecorationParts(view: EditorView): StaticDecorationParts {
  return {
    anchorState:
      getEditorDisplayMode() === 'source'
        ? buildSourceModeAnchorDecorationState(view)
        : buildPreviewAnchorDecorationState(view),
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

export function updateAnchorDecorationState(update: ViewUpdate, state: AnchorDecorationState): AnchorDecorationState {
  const startContent = update.startState.doc.toString();
  const nextContent = update.state.doc.toString();
  const startHasInlineAnchors = hasInlineAnchorMarkup(startContent);
  const nextHasInlineAnchors = hasInlineAnchorMarkup(nextContent);
  const hiddenInlineAnchorKeysChanged =
    (startHasInlineAnchors || nextHasInlineAnchors) &&
    getHiddenInlineAnchorKeys(update.startState as never) !== getHiddenInlineAnchorKeys(update.state as never);

  const anchorChanges: Array<{ from: number; to: number }> = [];
  const insertedTexts: string[] = [];
  update.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
    anchorChanges.push({ from: fromA, to: toA });
    insertedTexts.push(inserted.sliceString(0));
  });

  if (
    hiddenInlineAnchorKeysChanged ||
    shouldRebuildAnchorDecorationState({
      changes: anchorChanges,
      insertedTexts,
      sensitiveRanges: state.sensitiveRanges
    })
  ) {
    return getEditorDisplayMode() === 'source'
      ? buildSourceModeAnchorDecorationState(update.view)
      : buildPreviewAnchorDecorationState(update.view);
  }

  if (!nextHasInlineAnchors) {
    return {
      decorations: Decoration.none,
      sensitiveRanges: []
    };
  }

  return {
    ...state,
    decorations: state.decorations.map(update.changes)
  };
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
