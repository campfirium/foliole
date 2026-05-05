import { type Range } from '@codemirror/state';
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view';

import { collectAnchorTagTokenRanges, collectAnchorTextSegments } from '../model/anchorTagSegments';
import { getEditorDisplayMode } from '../model/editorDisplayMode';

import { addAnchorTagDecorations } from './liveMarkdownAnchors';
import { buildFrontmatterDecorationState, type FrontmatterDecorationState } from './liveMarkdownFrontmatter';
import { getHiddenTextAnchorKeys } from './liveMarkdown';
import { addSourceModeAnchorDecorations } from './liveMarkdownSourceAnchors';

interface AnchorDecorationState {
  decorations: DecorationSet;
  sensitiveRanges: Array<{ from: number; to: number }>;
}

function buildPreviewAnchorDecorationState(view: EditorView): AnchorDecorationState {
  const ranges: Range<Decoration>[] = [];
  const content = view.state.doc.toString();
  addAnchorTagDecorations(ranges, content, new Set(getHiddenTextAnchorKeys(view)));
  return {
    decorations: Decoration.set(ranges, true),
    sensitiveRanges: collectAnchorSensitiveRanges(content)
  };
}

function buildSourceModeAnchorDecorationState(view: EditorView): AnchorDecorationState {
  const ranges: Range<Decoration>[] = [];
  const content = view.state.doc.toString();
  addSourceModeAnchorDecorations(ranges, content);
  return {
    decorations: Decoration.set(ranges, true),
    sensitiveRanges: collectAnchorSensitiveRanges(content)
  };
}

function collectAnchorSensitiveRanges(content: string) {
  const tagRanges = collectAnchorTagTokenRanges(content);
  const contentRanges = collectAnchorTextSegments(content)
    .filter((segment) => segment.activeHighlightCount > 0 || segment.activeClozeCount > 0)
    .map((segment) => ({ from: segment.from, to: segment.to }));
  return tagRanges.concat(contentRanges);
}

function buildStaticDecorationParts(view: EditorView) {
  return {
    anchorState: getEditorDisplayMode() === 'source' ? buildSourceModeAnchorDecorationState(view) : buildPreviewAnchorDecorationState(view),
    frontmatterState: buildFrontmatterDecorationState(view)
  };
}

function mergeDecorationSets(docLength: number, ...sets: DecorationSet[]) {
  const ranges: Range<Decoration>[] = [];

  for (const set of sets) {
    set.between(0, docLength, (from, to, decoration) => {
      ranges.push(decoration.range(from, to));
    });
  }

  return Decoration.set(ranges, true);
}

const ANCHOR_REBUILD_PATTERN = /<\/?(?:highlight|cloze)\b|id="/;

function changeTouchesRanges(update: ViewUpdate, ranges: Array<{ from: number; to: number }>) {
  let touched = false;
  update.changes.iterChangedRanges((fromA, toA) => {
    if (touched) return;
    touched = ranges.some((range) =>
      fromA === toA ? range.from < fromA && range.to > fromA : range.from < toA && range.to > fromA
    );
  });
  return touched;
}

function changeIntroducesAnchorSyntax(update: ViewUpdate) {
  let shouldRebuild = false;
  update.changes.iterChanges((_fromA, _toA, _fromB, _toB, inserted) => {
    if (shouldRebuild || inserted.length === 0) return;
    shouldRebuild = ANCHOR_REBUILD_PATTERN.test(inserted.sliceString(0));
  });
  return shouldRebuild;
}

function shouldRebuildAnchorDecorations(update: ViewUpdate, anchorState: AnchorDecorationState) {
  return changeTouchesRanges(update, anchorState.sensitiveRanges) || changeIntroducesAnchorSyntax(update);
}

function shouldRebuildFrontmatter(update: ViewUpdate, inspectedUntilLine: number) {
  let shouldRebuild = false;
  update.changes.iterChangedRanges((fromA) => {
    if (shouldRebuild) return;
    shouldRebuild = update.startState.doc.lineAt(fromA).number <= inspectedUntilLine;
  });
  return shouldRebuild;
}

export const markdownStaticPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    anchorState: AnchorDecorationState;
    frontmatterState: FrontmatterDecorationState;

    constructor(view: EditorView) {
      const { anchorState, frontmatterState } = buildStaticDecorationParts(view);
      this.anchorState = anchorState;
      this.frontmatterState = frontmatterState;
      this.decorations = mergeDecorationSets(view.state.doc.length, anchorState.decorations, frontmatterState.decorations);
    }

    update(update: ViewUpdate) {
      const hiddenTextAnchorKeysChanged =
        getHiddenTextAnchorKeys(update.startState as never) !== getHiddenTextAnchorKeys(update.state as never);
      if (!update.docChanged && !hiddenTextAnchorKeysChanged) return;

      this.anchorState = shouldRebuildAnchorDecorations(update, this.anchorState)
        || hiddenTextAnchorKeysChanged
        ? (getEditorDisplayMode() === 'source'
            ? buildSourceModeAnchorDecorationState(update.view)
            : buildPreviewAnchorDecorationState(update.view))
        : {
            ...this.anchorState,
            decorations: this.anchorState.decorations.map(update.changes)
          };
      this.frontmatterState = shouldRebuildFrontmatter(update, this.frontmatterState.inspectedUntilLine)
        ? buildFrontmatterDecorationState(update.view)
        : {
            ...this.frontmatterState,
            decorations: this.frontmatterState.decorations.map(update.changes)
          };
      this.decorations = mergeDecorationSets(
        update.view.state.doc.length,
        this.anchorState.decorations,
        this.frontmatterState.decorations
      );
    }
  },
  { decorations: (value) => value.decorations }
);
