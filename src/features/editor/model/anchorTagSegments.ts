import type { AnchorKind } from './anchorBlocks';

const ANCHOR_TAG_PATTERN = /<(\/?)(highlight|cloze)\s+id="([1-9]\d*)"\s*>/g;

export interface AnchorTagToken {
  from: number;
  id: string;
  kind: AnchorKind;
  slash: boolean;
  to: number;
}

export interface AnchorTextSegment {
  activeClozeCount: number;
  activeHighlightCount: number;
  from: number;
  to: number;
}

function toKey(token: { id: string; kind: AnchorKind }) {
  return `${token.kind}:${token.id}`;
}

export function collectAnchorTagTokens(content: string): AnchorTagToken[] {
  const tokens: AnchorTagToken[] = [];
  for (const match of content.matchAll(ANCHOR_TAG_PATTERN)) {
    const from = match.index ?? -1;
    if (from < 0) {
      continue;
    }
    const raw = match[0];
    const kind = match[2];
    if (kind !== 'highlight' && kind !== 'cloze') {
      continue;
    }
    tokens.push({
      from,
      id: match[3] ?? '',
      kind,
      slash: match[1] === '/',
      to: from + raw.length
    });
  }
  return tokens;
}

export function collectAnchorTextSegments(content: string, hiddenAnchorKeys: ReadonlySet<string> = new Set()): AnchorTextSegment[] {
  const tokens = collectAnchorTagTokens(content);
  const activeKeys = new Set<string>();
  const segments: AnchorTextSegment[] = [];
  let cursor = 0;

  const pushSegment = (to: number) => {
    if (to <= cursor) {
      return;
    }
    const visibleKeys = [...activeKeys].filter((key) => !hiddenAnchorKeys.has(key));
    const activeHighlightCount = visibleKeys.filter((key) => key.startsWith('highlight:')).length;
    const activeClozeCount = visibleKeys.filter((key) => key.startsWith('cloze:')).length;
    segments.push({ activeClozeCount, activeHighlightCount, from: cursor, to });
  };

  for (const token of tokens) {
    pushSegment(token.from);
    const key = toKey(token);
    if (token.slash) {
      activeKeys.delete(key);
    } else {
      activeKeys.add(key);
    }
    cursor = token.to;
  }
  pushSegment(content.length);

  return segments;
}

export function createAnchorKey(anchor: { id: string; kind: AnchorKind }) {
  return toKey(anchor);
}

export function collectAnchorTagTokenRanges(content: string): Array<{ from: number; to: number }> {
  return collectAnchorTagTokens(content).map((token) => ({ from: token.from, to: token.to }));
}
