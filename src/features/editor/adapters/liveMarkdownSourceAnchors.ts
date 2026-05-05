import type { Range } from '@codemirror/state';
import { Decoration } from '@codemirror/view';

import { INLINE_ANCHOR_TAG_PATTERN } from './liveMarkdownAnchors';
import { addMark } from './liveMarkdownPrimitives';

export function addSourceModeAnchorDecorations(ranges: Range<Decoration>[], content: string) {
  let match = INLINE_ANCHOR_TAG_PATTERN.exec(content);
  while (match) {
    const from = match.index ?? -1;
    const raw = match[0] ?? '';
    const slashPart = match[1] ?? '';
    const kindPart = match[2] ?? '';
    const idPart = match[3] ?? '';

    if (from >= 0 && raw.length > 0) {
      const to = from + raw.length;
      const kindFrom = from + 1 + slashPart.length;
      const kindTo = kindFrom + kindPart.length;
      const idPrefix = 'id="';
      const idPrefixOffset = raw.indexOf(idPrefix);

      addMark(ranges, from, to, 'cm-md-anchor-tag-token');
      addMark(ranges, from, from + 1, 'cm-md-anchor-tag-delimiter');
      addMark(ranges, to - 1, to, 'cm-md-anchor-tag-delimiter');
      if (slashPart.length > 0) addMark(ranges, from + 1, from + 1 + slashPart.length, 'cm-md-anchor-tag-delimiter');
      addMark(ranges, kindFrom, kindTo, 'cm-md-anchor-tag-kind');

      if (idPrefixOffset >= 0) {
        const attrFrom = from + idPrefixOffset;
        const idFrom = attrFrom + idPrefix.length;
        const idTo = idFrom + idPart.length;
        addMark(ranges, attrFrom, idFrom, 'cm-md-anchor-tag-attr');
        addMark(ranges, idFrom, idTo, 'cm-md-anchor-tag-id');
        addMark(ranges, idTo, Math.min(idTo + 1, to), 'cm-md-anchor-tag-attr');
      }
    }
    match = INLINE_ANCHOR_TAG_PATTERN.exec(content);
  }
  INLINE_ANCHOR_TAG_PATTERN.lastIndex = 0;
}
