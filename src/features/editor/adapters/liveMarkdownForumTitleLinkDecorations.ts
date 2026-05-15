import type { Range } from '@codemirror/state';
import { Decoration } from '@codemirror/view';
import type { Decoration as DecorationType } from '@codemirror/view';

import type { MarkdownForumTitleLinkRange } from '../model/markdownForumTitleLinkProjection';

import { addMark, addReplace } from './liveMarkdownPrimitives';

export function addForumTitleLinkDecorations(
  ranges: Range<DecorationType>[],
  forumTitleLinks: ReadonlyArray<MarkdownForumTitleLinkRange>
) {
  for (const link of forumTitleLinks) {
    addMark(ranges, link.labelFrom, link.labelTo, 'cm-md-link-text', { 'data-md-link-url': link.href });
    for (const hiddenRange of link.hiddenRanges) {
      addReplace(ranges, hiddenRange.from, hiddenRange.to);
    }
    ranges.push(
      Decoration.line({ attributes: { class: 'cm-line-forum-title-link-hidden' } }).range(link.urlLineFrom)
    );
  }
}
