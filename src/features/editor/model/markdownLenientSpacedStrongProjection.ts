import type { MarkdownInlineRangeKind } from './markdownInlineProjectionTypes';

const MAX_LENIENT_SPACED_STRONG_CONTENT_LENGTH = 1200;

interface LenientSpacedStrongCandidate {
  contentFrom: number;
  contentTo: number;
  kind: MarkdownInlineRangeKind;
  syntaxRanges: Array<{ from: number; to: number }>;
  text: string;
  from: number;
  to: number;
}

function isWhitespace(value: string | undefined) {
  return value !== undefined && /\s/u.test(value);
}

function isPunctuation(value: string | undefined) {
  return value !== undefined && /\p{P}/u.test(value);
}

function findNextNonWhitespace(text: string, from: number, until: number) {
  for (let cursor = from; cursor < until; cursor += 1) {
    if (!isWhitespace(text[cursor])) return cursor;
  }
  return -1;
}

function findPreviousNonWhitespace(text: string, before: number) {
  for (let cursor = before - 1; cursor >= 0; cursor -= 1) {
    if (!isWhitespace(text[cursor])) return cursor;
  }
  return -1;
}

function isLenientSpacedStrongPair(text: string, openFrom: number, closeFrom: number) {
  if (text[openFrom - 1] === '*' || text[openFrom - 1] === '\\') return false;
  if (text[openFrom + 2] === '*' || text[closeFrom + 2] === '*') return false;
  const firstContent = findNextNonWhitespace(text, openFrom + 2, closeFrom);
  const lastContent = findPreviousNonWhitespace(text, closeFrom);
  if (firstContent < 0 || lastContent < firstContent) return false;
  const after = text[closeFrom + 2];
  if (after !== undefined && !isWhitespace(after) && !isPunctuation(after)) return false;
  return isPunctuation(text[firstContent]) && isPunctuation(text[lastContent]);
}

function createLenientSpacedStrongCandidate(text: string, openFrom: number, closeFrom: number) {
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

export function collectLenientSpacedStrongCandidates(text: string): LenientSpacedStrongCandidate[] {
  const candidates: LenientSpacedStrongCandidate[] = [];
  let cursor = 0;

  while (cursor < text.length) {
    const openFrom = text.indexOf('**', cursor);
    if (openFrom < 0) break;
    const searchTo = Math.min(text.length, openFrom + MAX_LENIENT_SPACED_STRONG_CONTENT_LENGTH);
    const closeFrom = text.indexOf('**', openFrom + 2);
    if (closeFrom >= 0 && closeFrom <= searchTo && isLenientSpacedStrongPair(text, openFrom, closeFrom)) {
      candidates.push(createLenientSpacedStrongCandidate(text, openFrom, closeFrom));
      cursor = closeFrom + 2;
      continue;
    }
    cursor = openFrom + 2;
  }

  return candidates;
}
