import { type DecorationSet, type EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view';

import type { FrontmatterDecorationState } from './liveMarkdownFrontmatter';
import {
  buildStaticDecorationParts,
  mergeDecorationSets,
  updateFrontmatterDecorationState
} from './liveMarkdownStaticState';

export const markdownStaticPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    frontmatterState: FrontmatterDecorationState;

    constructor(view: EditorView) {
      const { frontmatterState } = buildStaticDecorationParts(view);
      this.frontmatterState = frontmatterState;
      this.decorations = mergeDecorationSets(view.state.doc.length, frontmatterState.decorations);
    }

    update(update: ViewUpdate) {
      if (!update.docChanged) return;

      this.frontmatterState = updateFrontmatterDecorationState(update, this.frontmatterState);
      this.decorations = mergeDecorationSets(update.view.state.doc.length, this.frontmatterState.decorations);
    }
  },
  { decorations: (value) => value.decorations }
);
