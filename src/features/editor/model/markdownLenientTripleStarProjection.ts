import type { MarkdownInlineRangeKind } from './markdownInlineProjectionTypes';

const MAX_LENIENT_TRIPLE_STAR_CONTENT_LENGTH = 160;

interface LenientTripleStarCandidate {
  contentFrom: number;
  contentTo: number;
  kind: MarkdownInlineRangeKind;
  syntaxRanges: Array<{ from: number; to: number }>;
  text: string;
  from: number;
  to: number;
}

function isLenientTripleOpening(text: string, from: number) {
  const before = text[from - 1];
  const after = text[from + 3];
  if (before === '*' || before === '\\') return false;
  return after !== undefined && !/\s/u.test(after);
}

function isLenientTripleClosing(text: string, from: number) {
  if (!/\s/u.test(text[from - 1] ?? '')) return false;
  return text[from + 3] === undefined || /\s/u.test(text[from + 3] ?? '');
}

function createLenientTripleStarCandidates(text: string, openFrom: number, closeFrom: number): LenientTripleStarCandidate[] {
  return [
    {
      contentFrom: openFrom + 1,
      contentTo: closeFrom + 2,
      from: openFrom,
      kind: 'emphasis',
      syntaxRanges: [
        { from: openFrom, to: openFrom + 1 },
        { from: closeFrom + 2, to: closeFrom + 3 }
      ],
      text: text.slice(openFrom + 1, closeFrom + 2),
      to: closeFrom + 3
    },
    {
      contentFrom: openFrom + 3,
      contentTo: closeFrom,
      from: openFrom + 1,
      kind: 'strong',
      syntaxRanges: [
        { from: openFrom + 1, to: openFrom + 3 },
        { from: closeFrom, to: closeFrom + 2 }
      ],
      text: text.slice(openFrom + 3, closeFrom),
      to: closeFrom + 2
    }
  ];
}

export function collectLenientTripleStarCandidates(text: string): LenientTripleStarCandidate[] {
  const candidates: LenientTripleStarCandidate[] = [];
  let cursor = 0;

  while (cursor < text.length) {
    const openFrom = text.indexOf('***', cursor);
    if (openFrom < 0) break;
    const closeFrom = text.indexOf('***', openFrom + 3);
    const searchTo = Math.min(text.length, openFrom + MAX_LENIENT_TRIPLE_STAR_CONTENT_LENGTH);
    if (isLenientTripleOpening(text, openFrom) && closeFrom >= 0 && closeFrom <= searchTo && isLenientTripleClosing(text, closeFrom)) {
      candidates.push(...createLenientTripleStarCandidates(text, openFrom, closeFrom));
      cursor = closeFrom + 3;
      continue;
    }
    cursor = openFrom + 3;
  }

  return candidates;
}
