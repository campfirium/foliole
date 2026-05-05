import { type DecorationSet, type EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view';

import { hasInlineAnchorMarkup } from '../model/anchorBlocks';

import type { FrontmatterDecorationState } from './liveMarkdownFrontmatter';
import { getHiddenInlineAnchorKeys } from './liveMarkdownState';
import {
  buildStaticDecorationParts,
  mergeDecorationSets,
  type AnchorDecorationState,
  updateAnchorDecorationState,
  updateFrontmatterDecorationState
} from './liveMarkdownStaticState';

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
      const startHasInlineAnchors = hasInlineAnchorMarkup(update.startState.doc.toString());
      const nextHasInlineAnchors = hasInlineAnchorMarkup(update.state.doc.toString());
      const hiddenInlineAnchorKeysChanged =
        (startHasInlineAnchors || nextHasInlineAnchors) &&
        getHiddenInlineAnchorKeys(update.startState as never) !== getHiddenInlineAnchorKeys(update.state as never);
      if (!update.docChanged && !hiddenInlineAnchorKeysChanged) return;

      this.anchorState = updateAnchorDecorationState(update, this.anchorState);
      this.frontmatterState = updateFrontmatterDecorationState(update, this.frontmatterState);
      this.decorations = mergeDecorationSets(
        update.view.state.doc.length,
        this.anchorState.decorations,
        this.frontmatterState.decorations
      );
    }
  },
  { decorations: (value) => value.decorations }
);
