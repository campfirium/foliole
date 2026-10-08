import { expect, it } from 'vitest';

import { assertTextBodyWithinBudget, TEXT_BODY_MAX_BYTES, utf8ByteLength } from './textBodyBudget.js';

it('counts UTF-8 bytes including Chinese, emoji and unmatched surrogate code units', () => {
  for (const content of ['', 'abc', '中文😀', '\ud800', '\udc00', '\r\n']) {
    expect(utf8ByteLength(content)).toBe(Buffer.byteLength(content, 'utf8'));
  }
});

it('accepts the exact byte budget and rejects the first byte beyond it', () => {
  expect(() => assertTextBodyWithinBudget('x'.repeat(TEXT_BODY_MAX_BYTES))).not.toThrow();
  expect(() => assertTextBodyWithinBudget('x'.repeat(TEXT_BODY_MAX_BYTES) + 'x')).toThrow('text_body_too_large');
  expect(() => assertTextBodyWithinBudget('中'.repeat(349_525) + '😀')).toThrow('text_body_too_large');
});
