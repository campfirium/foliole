import type { InlineContext, MarkdownConfig } from '@lezer/markdown';

const SourceHighlightDelimiter = {
  mark: 'SourceHighlightMark',
  resolve: 'SourceHighlight'
};

const WIKI_LINK_CLOSE = ']]';

function isWhitespaceCode(value: number) {
  return value === 9 || value === 10 || value === 13 || value === 32;
}

function findWikiLinkClose(cx: InlineContext, pos: number) {
  for (let cursor = pos + 2; cursor < cx.end - 1; cursor += 1) {
    const char = cx.char(cursor);
    if (char === 10 || char === 13) return -1;
    if (char === 93 && cx.char(cursor + 1) === 93) return cursor;
  }
  return -1;
}

function findAliasSeparator(cx: InlineContext, from: number, to: number) {
  for (let cursor = from; cursor < to; cursor += 1) {
    if (cx.char(cursor) === 124) return cursor;
  }
  return -1;
}

function trimBounds(cx: InlineContext, from: number, to: number) {
  let start = from;
  let end = to;
  while (start < end && isWhitespaceCode(cx.char(start))) start += 1;
  while (end > start && isWhitespaceCode(cx.char(end - 1))) end -= 1;
  return { from: start, to: end };
}

function parseCalloutMarker(cx: InlineContext, pos: number) {
  if (cx.char(pos + 1) !== 33) return -1;
  let cursor = pos + 2;
  if (!isAsciiLetter(cx.char(cursor))) return -1;
  while (isCalloutKindCode(cx.char(cursor))) cursor += 1;
  if (cx.char(cursor) !== 93) return -1;
  return cx.addElement(cx.elt('CalloutMarker', pos, cursor + 1, [
    cx.elt('CalloutMark', pos, pos + 2),
    cx.elt('CalloutKind', pos + 2, cursor),
    cx.elt('CalloutMark', cursor, cursor + 1)
  ]));
}

function parseFootnote(cx: InlineContext, pos: number) {
  if (cx.char(pos + 1) !== 91) return -1;
  const labelTo = findClosingChar(cx, pos + 2, 93);
  if (labelTo < 0 || labelTo === pos + 2) return -1;
  const noteBounds = cx.char(labelTo + 1) === 123 ? findFootnoteNoteBounds(cx, labelTo + 2) : null;
  const to = noteBounds ? noteBounds.to + 1 : labelTo + 1;
  const children = [
    cx.elt('FootnoteMark', pos, pos + 2),
    cx.elt('FootnoteLabel', pos + 2, labelTo),
    cx.elt('FootnoteMark', labelTo, labelTo + 1)
  ];
  if (noteBounds) {
    children.push(cx.elt('FootnoteMark', labelTo + 1, labelTo + 2));
    children.push(cx.elt('FootnoteNote', noteBounds.from, noteBounds.to));
    children.push(cx.elt('FootnoteMark', noteBounds.to, noteBounds.to + 1));
  }
  return cx.addElement(cx.elt('Footnote', pos, to, children));
}

function parseEmbed(cx: InlineContext, pos: number) {
  if (cx.char(pos + 1) !== 91 || cx.char(pos + 2) !== 91) return -1;
  const closeFrom = findWikiLinkClose(cx, pos + 1);
  if (closeFrom < 0) return -1;
  const innerFrom = pos + 3;
  const separator = findAliasSeparator(cx, innerFrom, closeFrom);
  const targetBounds = trimBounds(cx, innerFrom, separator < 0 ? closeFrom : separator);
  if (targetBounds.from === targetBounds.to) return -1;
  const children = [
    cx.elt('EmbedMark', pos, innerFrom),
    cx.elt('EmbedTarget', targetBounds.from, targetBounds.to)
  ];
  if (separator >= 0) {
    const aliasBounds = trimBounds(cx, separator + 1, closeFrom);
    if (aliasBounds.from < aliasBounds.to) children.push(cx.elt('EmbedAlias', aliasBounds.from, aliasBounds.to));
  }
  children.push(cx.elt('EmbedMark', closeFrom, closeFrom + WIKI_LINK_CLOSE.length));
  return cx.addElement(cx.elt('Embed', pos, closeFrom + WIKI_LINK_CLOSE.length, children));
}

function findClosingChar(cx: InlineContext, from: number, closeCode: number) {
  for (let cursor = from; cursor < cx.end; cursor += 1) {
    const char = cx.char(cursor);
    if (char === 10 || char === 13) return -1;
    if (char === closeCode) return cursor;
  }
  return -1;
}

function findFootnoteNoteBounds(cx: InlineContext, from: number) {
  let escaped = false;
  for (let cursor = from; cursor < cx.end; cursor += 1) {
    const char = cx.char(cursor);
    if (char === 10 || char === 13) return null;
    if (!escaped && char === 125) return { from, to: cursor };
    escaped = !escaped && char === 92;
  }
  return null;
}

function isAsciiLetter(value: number) {
  return (value >= 65 && value <= 90) || (value >= 97 && value <= 122);
}

function isCalloutKindCode(value: number) {
  return isAsciiLetter(value) || (value >= 48 && value <= 57) || value === 45 || value === 95;
}

export const folioleMarkdownExtensions: MarkdownConfig[] = [
  {
    defineNodes: [
      'CalloutKind',
      'CalloutMark',
      'CalloutMarker',
      'Embed',
      'EmbedAlias',
      'EmbedMark',
      'EmbedTarget',
      'Footnote',
      'FootnoteLabel',
      'FootnoteMark',
      'FootnoteNote',
      'SourceHighlight',
      'SourceHighlightMark',
      'WikiLink',
      'WikiLinkAlias',
      'WikiLinkMark',
      'WikiLinkTarget'
    ],
    parseInline: [
      {
        name: 'Embed',
        parse(cx, next, pos) {
          return next === 33 ? parseEmbed(cx, pos) : -1;
        },
        before: 'Image'
      },
      {
        name: 'Footnote',
        parse(cx, next, pos) {
          return next === 94 ? parseFootnote(cx, pos) : -1;
        },
        before: 'Superscript'
      },
      {
        name: 'CalloutMarker',
        parse(cx, next, pos) {
          return next === 91 ? parseCalloutMarker(cx, pos) : -1;
        },
        before: 'Link'
      },
      {
        name: 'WikiLink',
        parse(cx, next, pos) {
          if (next !== 91 || cx.char(pos + 1) !== 91 || cx.char(pos - 1) === 33) return -1;
          const closeFrom = findWikiLinkClose(cx, pos);
          if (closeFrom < 0) return -1;
          const innerFrom = pos + 2;
          const separator = findAliasSeparator(cx, innerFrom, closeFrom);
          const targetBounds = trimBounds(cx, innerFrom, separator < 0 ? closeFrom : separator);
          if (targetBounds.from === targetBounds.to) return -1;
          const children = [
            cx.elt('WikiLinkMark', pos, innerFrom),
            cx.elt('WikiLinkTarget', targetBounds.from, targetBounds.to)
          ];
          if (separator >= 0) {
            const aliasBounds = trimBounds(cx, separator + 1, closeFrom);
            if (aliasBounds.from < aliasBounds.to) children.push(cx.elt('WikiLinkAlias', aliasBounds.from, aliasBounds.to));
          }
          children.push(cx.elt('WikiLinkMark', closeFrom, closeFrom + WIKI_LINK_CLOSE.length));
          return cx.addElement(cx.elt('WikiLink', pos, closeFrom + WIKI_LINK_CLOSE.length, children));
        },
        before: 'Link'
      },
      {
        name: 'SourceHighlight',
        parse(cx, next, pos) {
          if (next !== 61 || cx.char(pos + 1) !== 61 || cx.char(pos + 2) === 61) return -1;
          const before = pos > cx.offset ? cx.char(pos - 1) : -1;
          const after = cx.char(pos + 2);
          const open = after >= 0 && after !== 61 && !isWhitespaceCode(after);
          const close = before >= 0 && before !== 61 && !isWhitespaceCode(before);
          if (!open && !close) return -1;
          return cx.addDelimiter(SourceHighlightDelimiter, pos, pos + 2, open, close);
        },
        after: 'Emphasis'
      }
    ]
  }
];
