import type { StoredAnchorLink } from '../database/anchorLinkCodec.js';

import { assertTextBodyWithinBudget, TEXT_BODY_MAX_BYTES, utf8ByteLength } from './textBodyBudget.js';

export const NODE_TEXT_MAX_BYTES = TEXT_BODY_MAX_BYTES;

export class NodeTextTooLargeError extends Error {
  constructor(readonly field: string, readonly actualBytes: number) {
    super(`node_text_too_large:${field}`);
    this.name = 'NodeTextTooLargeError';
  }
}

export function assertNodeTextWithinBudget(value: string | null | undefined, field: string) {
  const bytes = utf8ByteLength(value ?? '');
  if (bytes > NODE_TEXT_MAX_BYTES) throw new NodeTextTooLargeError(field, bytes);
}

export function assertNodeAnchorTextWithinBudget(anchorLink: Pick<StoredAnchorLink, 'locator'> | null | undefined) {
  const locator = anchorLink?.locator;
  if (!locator) return;
  if ('ranges' in locator) {
    const bytes = locator.ranges.reduce((total, range) => total + utf8ByteLength(range.originalText), 0);
    if (bytes > NODE_TEXT_MAX_BYTES) throw new NodeTextTooLargeError('anchorText', bytes);
  } else if ('originalText' in locator) {
    assertNodeTextWithinBudget(locator.originalText, 'anchorText');
  } else if ('formulaSource' in locator) {
    assertNodeTextWithinBudget(locator.formulaSource, 'anchorText');
  }
}

export function assertNodeTextFieldsWithinBudget(input: {
  content: string;
  title?: string;
  reveal?: string | null;
  anchorLink?: Pick<StoredAnchorLink, 'locator'> | null;
}) {
  assertTextBodyWithinBudget(input.content);
  assertNodeTextWithinBudget(input.title, 'title');
  assertNodeTextWithinBudget(input.reveal, 'reveal');
  assertNodeAnchorTextWithinBudget(input.anchorLink);
}
