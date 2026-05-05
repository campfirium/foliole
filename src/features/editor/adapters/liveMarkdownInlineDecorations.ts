import type { Range } from '@codemirror/state';
import { Decoration, WidgetType } from '@codemirror/view';

import { collectImageMatches, createMarkdownImageWidgetDom, type MarkdownImageMatch } from './liveMarkdownImages';
import { addMark, addReplace } from './liveMarkdownPrimitives';

const INLINE_LINK_PATTERN = /(?<!!)\[([^\]\n]*)\]\(([^)\n]*)\)/g;

export interface RangeBounds {
  from: number;
  to: number;
}

export interface InlineCodeMatch extends RangeBounds {
  contentFrom: number;
  contentTo: number;
}

export interface InlineLinkMatch extends RangeBounds {
  labelFrom: number;
  labelTo: number;
  hiddenRanges: RangeBounds[];
  href: string;
}

class MarkdownImageWidget extends WidgetType {
  readonly editorNodeId: string | null;
  readonly imageMatch: MarkdownImageMatch;
  readonly presentationVersion: number;

  constructor(imageMatch: MarkdownImageMatch, editorNodeId: string | null, presentationVersion: number) {
    super();
    this.editorNodeId = editorNodeId;
    this.imageMatch = imageMatch;
    this.presentationVersion = presentationVersion;
  }

  eq(other: MarkdownImageWidget) {
    return (
      this.editorNodeId === other.editorNodeId &&
      this.presentationVersion === other.presentationVersion &&
      this.imageMatch.alt === other.imageMatch.alt &&
      this.imageMatch.attachmentId === other.imageMatch.attachmentId &&
      this.imageMatch.from === other.imageMatch.from &&
      this.imageMatch.source === other.imageMatch.source &&
      this.imageMatch.to === other.imageMatch.to
    );
  }

  toDOM() {
    return createMarkdownImageWidgetDom(this.imageMatch, this.editorNodeId);
  }
}

export { collectImageMatches };

export function addImageDecorations(
  ranges: Range<Decoration>[],
  imageMatches: ReadonlyArray<MarkdownImageMatch>,
  preserveSource = false,
  editorNodeId: string | null = null,
  presentationVersion = 0
) {
  for (const imageMatch of imageMatches) {
    if (preserveSource) {
      ranges.push(
        Decoration.widget({
          side: 1,
          widget: new MarkdownImageWidget(imageMatch, editorNodeId, presentationVersion)
        }).range(imageMatch.to)
      );
      continue;
    }

    ranges.push(
      Decoration.replace({
        widget: new MarkdownImageWidget(imageMatch, editorNodeId, presentationVersion),
        inclusive: false
      }).range(
        imageMatch.from,
        imageMatch.to
      )
    );
  }
}

export function collectInlineCodeMatches(from: number, text: string): InlineCodeMatch[] {
  const matches: InlineCodeMatch[] = [];
  let index = 0;
  while (index < text.length) {
    if (text[index] !== '`') {
      index += 1;
      continue;
    }
    const openerStart = index;
    while (index < text.length && text[index] === '`') index += 1;
    const delimiterLength = index - openerStart;
    const openerEnd = index;

    let cursor = openerEnd;
    let foundClosing = false;
    while (cursor < text.length) {
      if (text[cursor] !== '`') {
        cursor += 1;
        continue;
      }
      const closerStart = cursor;
      while (cursor < text.length && text[cursor] === '`') cursor += 1;
      const closerLength = cursor - closerStart;
      if (closerLength !== delimiterLength) continue;
      matches.push({ from: from + openerStart, to: from + cursor, contentFrom: from + openerEnd, contentTo: from + closerStart });
      foundClosing = true;
      break;
    }
    if (!foundClosing) index = openerEnd;
  }
  return matches;
}

export function addInlineCodeDecorations(
  ranges: Range<Decoration>[],
  codeMatches: ReadonlyArray<InlineCodeMatch>,
  showSyntax: boolean
) {
  for (const codeMatch of codeMatches) {
    addMark(ranges, codeMatch.contentFrom, codeMatch.contentTo, 'cm-md-inline-code');
    if (showSyntax) {
      addMark(ranges, codeMatch.from, codeMatch.contentFrom, 'cm-md-syntax-visible');
      addMark(ranges, codeMatch.contentTo, codeMatch.to, 'cm-md-syntax-visible');
      continue;
    }
    addReplace(ranges, codeMatch.from, codeMatch.contentFrom);
    addReplace(ranges, codeMatch.contentTo, codeMatch.to);
  }
}

function isWithinRanges(from: number, to: number, ranges: ReadonlyArray<RangeBounds>) {
  for (const range of ranges) {
    if (from < range.to && to > range.from) {
      return true;
    }
  }
  return false;
}

export function collectInlineLinkMatches(
  from: number,
  text: string,
  preservedRanges: ReadonlyArray<RangeBounds>
): InlineLinkMatch[] {
  const matches: InlineLinkMatch[] = [];
  let match = INLINE_LINK_PATTERN.exec(text);
  while (match) {
    const start = from + match.index;
    const fullText = match[0] ?? '';
    const label = match[1] ?? '';
    const labelFrom = start + 1;
    const labelTo = labelFrom + label.length;
    const pairFrom = labelTo;
    const pairTo = pairFrom + 2;
    const linkTo = start + fullText.length;

    if (!isWithinRanges(start, linkTo, preservedRanges)) {
      const urlFrom = pairTo;
      const urlTo = linkTo - 1;
      matches.push({
        from: start,
        to: linkTo,
        labelFrom,
        labelTo,
        hiddenRanges: [
          { from: start, to: start + 1 },
          { from: pairFrom, to: pairTo },
          { from: urlFrom, to: urlTo },
          { from: linkTo - 1, to: linkTo }
        ],
        href: match[2] ?? ''
      });
    }
    match = INLINE_LINK_PATTERN.exec(text);
  }
  INLINE_LINK_PATTERN.lastIndex = 0;
  return matches;
}

export function addInlineLinkDecorations(
  ranges: Range<Decoration>[],
  linkMatches: ReadonlyArray<InlineLinkMatch>,
  showSyntax: boolean
) {
  for (const linkMatch of linkMatches) {
    addMark(ranges, linkMatch.labelFrom, linkMatch.labelTo, 'cm-md-link-text', {
      'data-md-link-url': linkMatch.href
    });

    for (const hiddenRange of linkMatch.hiddenRanges) {
      if (showSyntax) addMark(ranges, hiddenRange.from, hiddenRange.to, 'cm-md-syntax-visible');
      else addReplace(ranges, hiddenRange.from, hiddenRange.to);
    }
  }
}
