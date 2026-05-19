import type { MarkdownInlineRangeKind } from './markdownInlineProjectionTypes';

const MAX_LENIENT_ADJACENT_STRONG_CONTENT_LENGTH = 1200;

interface LenientAdjacentStrongCandidate {
  contentFrom: number;
  contentTo: number;
  kind: MarkdownInlineRangeKind;
  syntaxRanges: Array<{ from: number; to: number }>;
  text: string;
  from: number;
  to: number;
}

function isEscapedOrAdjacentStar(text: string, from: number) {
  return text[from - 1] === '*' || text[from - 1] === '\\' || text[from + 2] === '*';
}

function isValidClosingMark(text: string, from: number) {
  return text[from - 1] !== '*' && text[from + 2] !== '*';
}

function createLenientAdjacentStrongCandidate(text: string, openFrom: number, closeFrom: number) {
  return {
    contentFrom: openFrom + 2,
    contentTo: closeFrom,
    from: openFrom,
    kind: 'strong' as const,
    syntaxRanges: [
      { from: openFrom, to: openFrom + 2 },
      { from: closeFrom, to: closeFrom + 2 }
    ],
    text: text.slice(openFrom + 2, closeFrom),
    to: closeFrom + 2
  };
}

export function collectLenientAdjacentStrongCandidates(text: string): LenientAdjacentStrongCandidate[] {
  const candidates: LenientAdjacentStrongCandidate[] = [];
  let cursor = 0;

  while (cursor < text.length) {
    const openFrom = text.indexOf('**', cursor);
    if (openFrom < 0) break;
    if (isEscapedOrAdjacentStar(text, openFrom)) {
      cursor = openFrom + 2;
      continue;
    }

    const searchTo = Math.min(text.length, openFrom + MAX_LENIENT_ADJACENT_STRONG_CONTENT_LENGTH);
    const closeFrom = text.indexOf('**', openFrom + 2);
    if (closeFrom > openFrom + 2 && closeFrom <= searchTo && isValidClosingMark(text, closeFrom)) {
      candidates.push(createLenientAdjacentStrongCandidate(text, openFrom, closeFrom));
      cursor = closeFrom + 2;
      continue;
    }
    cursor = openFrom + 2;
  }

  return candidates;
}
