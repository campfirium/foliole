import { expect, it } from 'vitest';

import {
  assertNodeAnchorTextWithinBudget,
  assertNodeTextFieldsWithinBudget,
  assertNodeTextWithinBudget,
  NODE_TEXT_MAX_BYTES,
  NodeTextTooLargeError
} from './nodeTextBudget.js';

it.each(['title', 'reveal', 'anchorText'])('accepts exactly 1 MiB and rejects the next UTF-8 byte for %s', (field) => {
  const exact = '中'.repeat(349_525) + 'x';
  expect(() => assertNodeTextWithinBudget(exact, field)).not.toThrow();
  expect(() => assertNodeTextWithinBudget(exact + 'x', field)).toThrow(new NodeTextTooLargeError(field, NODE_TEXT_MAX_BYTES + 1));
});

it('limits a grouped reference as one item without changing any source text', () => {
  const anchorLink = { locator: { ranges: [
    { from: 0, to: 524_288, originalText: 'x'.repeat(524_288) },
    { from: 524_288, to: 1_048_577, originalText: 'x'.repeat(524_289) }
  ] } };
  expect(() => assertNodeAnchorTextWithinBudget(anchorLink)).toThrow('node_text_too_large:anchorText');
  expect(anchorLink.locator.ranges[1]?.originalText.length).toBe(524_289);
});

it('checks the answer independently from a short prompt', () => {
  expect(() => assertNodeTextFieldsWithinBudget({ content: '[...]', reveal: 'x'.repeat(NODE_TEXT_MAX_BYTES + 1) }))
    .toThrow('node_text_too_large:reveal');
  expect(() => assertNodeTextFieldsWithinBudget({ content: 'x'.repeat(NODE_TEXT_MAX_BYTES), reveal: null })).not.toThrow();
});

it('retains the original oversized-body error and permits absent optional text', () => {
  expect(() => assertNodeTextFieldsWithinBudget({ content: 'x'.repeat(NODE_TEXT_MAX_BYTES + 1) })).toThrow('text_body_too_large');
  expect(() => assertNodeTextFieldsWithinBudget({ content: '' })).not.toThrow();
});
