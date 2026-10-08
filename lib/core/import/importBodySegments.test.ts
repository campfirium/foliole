import { expect, it } from 'vitest';

import { IMPORT_BODY_MAX_BYTES, splitImportBody } from './importBodySegments.js';

function expectLossless(content: string, budget = IMPORT_BODY_MAX_BYTES) {
  const segments = splitImportBody(content, budget);
  expect(segments.map((segment) => segment.content).join('')).toBe(content);
  for (const segment of segments) {
    expect(Buffer.byteLength(segment.content, 'utf8')).toBeLessThanOrEqual(budget);
    expect(content.slice(segment.from, segment.to)).toBe(segment.content);
    expect(segment.content).not.toContain('\ufffd');
  }
  return segments;
}

it('keeps empty, below-limit and exactly-limit stored bodies unchanged', () => {
  for (const content of ['', 'x'.repeat(IMPORT_BODY_MAX_BYTES - 1), 'x'.repeat(IMPORT_BODY_MAX_BYTES)]) {
    expect(splitImportBody(content)).toEqual([{ content, from: 0, to: content.length }]);
  }
});

it('splits the first byte beyond the limit without dropping source text', () => {
  const segments = expectLossless('x'.repeat(IMPORT_BODY_MAX_BYTES + 1));
  expect(segments.map((segment) => segment.content.length)).toEqual([IMPORT_BODY_MAX_BYTES, 1]);
});

it('measures Chinese and emoji in UTF-8 bytes and preserves whole characters', () => {
  const content = '中'.repeat(349_525) + '😀' + '尾';
  const segments = expectLossless(content);
  expect(segments).toHaveLength(2);
  expect(segments[1]?.content).toBe('😀尾');
});

it('preserves a long paragraph, line endings, whitespace and stored metadata', () => {
  const content = '---\r\ntitle: Example\r\n---\r\n# Title\r\n\r\n' + ' 文😀'.repeat(150_000) + '\r\n  ';
  expect(expectLossless(content).length).toBeGreaterThan(1);
});

it('uses a nearby line ending without interpreting chapter names', () => {
  const content = 'x'.repeat(50) + '\n' + 'y'.repeat(60);
  const segments = expectLossless(content, 80);
  expect(segments[0]?.content).toBe('x'.repeat(50) + '\n');
  expect(segments[1]?.content).toBe('y'.repeat(60));
});

it('prefers paragraph boundaries when no nearby chapter begins', () => {
  const content = 'x'.repeat(50) + '\n\n' + 'y'.repeat(60);
  expect(expectLossless(content, 80)[0]?.content).toBe('x'.repeat(50) + '\n\n');
});

it('rejects invalid budgets rather than losing characters or looping', () => {
  for (const budget of [0, 3, 4.5, Infinity]) {
    expect(() => splitImportBody('😀', budget)).toThrow('import_body_byte_budget_invalid');
  }
});

it('keeps a CRLF line ending together when it straddles the byte limit', () => {
  const segments = expectLossless('abc\r\ndef', 4);
  expect(segments[0]?.content).toBe('abc');
  expect(segments[1]?.content.startsWith('\r\n')).toBe(true);
});
