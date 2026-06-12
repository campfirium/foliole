import type { EditorView } from '@codemirror/view';

import {
  collectMarkdownForumTitleLinkRanges,
  type MarkdownForumTitleLinkRange
} from '../model/markdownForumTitleLinkProjection';

interface ViewportForumTitleLinkContext {
  endLineNumber: number;
  startLineNumber: number;
  viewportRange: { from: number; to: number };
}

function overlapsViewport(link: MarkdownForumTitleLinkRange, viewportRange: { from: number; to: number }) {
  return link.to >= viewportRange.from && link.from <= viewportRange.to;
}

export function collectViewportForumTitleLinks(
  view: EditorView,
  context: ViewportForumTitleLinkContext,
  codeLineFroms: ReadonlySet<number>
) {
  const startLine = view.state.doc.line(Math.max(1, context.startLineNumber - 1));
  const endLine = view.state.doc.line(Math.min(view.state.doc.lines, context.endLineNumber + 1));
  return collectMarkdownForumTitleLinkRanges(view.state.doc.sliceString(startLine.from, endLine.to), startLine.from)
    .filter((link) =>
      overlapsViewport(link, context.viewportRange) &&
      !(codeLineFroms.has(link.from) || codeLineFroms.has(link.urlLineFrom))
    );
}
