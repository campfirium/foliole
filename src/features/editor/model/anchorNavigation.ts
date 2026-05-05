import type { EditorSelection } from '../adapters/EditorAdapter';

import { collectAnchorTagTokens } from './anchorTagSegments';

export interface AnchorNavigationTarget {
  id: string;
  kind: 'highlight' | 'cloze';
}

export function findAnchorSelection(content: string, anchor: AnchorNavigationTarget): EditorSelection | null {
  const tokens = collectAnchorTagTokens(content);
  let cursor = 0;
  let isActive = false;
  let from: number | null = null;
  let to = -1;

  for (const token of tokens) {
    if (token.from > cursor && isActive) {
      from = from ?? cursor;
      to = token.from;
    }

    const isTargetToken = token.kind === anchor.kind && token.id === anchor.id;
    if (isTargetToken) {
      isActive = !token.slash;
    }
    cursor = token.to;
  }

  if (cursor < content.length && isActive) {
    from = from ?? cursor;
    to = content.length;
  }

  if (from === null || to <= from) {
    return null;
  }
  return {
    from,
    to
  };
}
