import type { MarkdownConfig } from '@lezer/markdown';

const SourceHighlightDelimiter = {
  mark: 'SourceHighlightMark',
  resolve: 'SourceHighlight'
};

const WIKI_LINK_CLOSE = ']]';

function isWhitespaceCode(value: number) {
  return value === 9 || value === 10 || value === 13 || value === 32;
}

function findWikiLinkClose(cx: Parameters<NonNullable<MarkdownConfig['parseInline']>[number]['parse']>[0], pos: number) {
  for (let cursor = pos + 2; cursor < cx.end - 1; cursor += 1) {
    const char = cx.char(cursor);
    if (char === 10 || char === 13) return -1;
    if (char === 93 && cx.char(cursor + 1) === 93) return cursor;
  }
  return -1;
}

function findAliasSeparator(cx: Parameters<NonNullable<MarkdownConfig['parseInline']>[number]['parse']>[0], from: number, to: number) {
  for (let cursor = from; cursor < to; cursor += 1) {
    if (cx.char(cursor) === 124) return cursor;
  }
  return -1;
}

function trimBounds(cx: Parameters<NonNullable<MarkdownConfig['parseInline']>[number]['parse']>[0], from: number, to: number) {
  let start = from;
  let end = to;
  while (start < end && isWhitespaceCode(cx.char(start))) start += 1;
  while (end > start && isWhitespaceCode(cx.char(end - 1))) end -= 1;
  return { from: start, to: end };
}

export const folioleMarkdownExtensions: MarkdownConfig[] = [
  {
    defineNodes: ['SourceHighlight', 'SourceHighlightMark', 'WikiLink', 'WikiLinkAlias', 'WikiLinkMark', 'WikiLinkTarget'],
    parseInline: [
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
