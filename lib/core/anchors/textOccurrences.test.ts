import { expect, it } from 'vitest';

import { repairTextAnchorLocatorInContent } from './textAnchorTextSearch.js';
import { TextOccurrences } from './textOccurrences.js';

function expected(text: string, pattern: string) {
  if (!pattern) return { count: 0, first: null };
  const first = text.indexOf(pattern);
  return { count: first < 0 ? 0 : text.indexOf(pattern, first + 1) < 0 ? 1 : 2,
    first: first < 0 ? null : first };
}

it.each([
  ['aaaa', 'aa'], ['中文😀中文', '文😀'], ['😀😀', '😀'], ['abc', 'z'],
  ['abaabaaba', 'abaaba'], ['', ''], ['abc', ''],
  ['x'.repeat(512 * 1024 - 1) + '中😀needle' + 'z'.repeat(512 * 1024), '中😀needle']
])('keeps overlap and UTF-16 positions across arbitrary text chunks', (text, pattern) => {
  const sizes = text.length > 1024 ? [512 * 1024] : [1, 2, 3, 7, 512 * 1024];
  for (const size of sizes) {
    const occurrences = new TextOccurrences(pattern);
    for (let offset = 0; offset < text.length; offset += size) occurrences.push(text.slice(offset, offset + size));
    expect({ count: occurrences.count, first: occurrences.first }).toEqual(expected(text, pattern));
  }
});

it('preserves an original hit and repairs only a unique occurrence', () => {
  const original = { from: 1, to: 3, originalText: 'aa' };
  expect(repairTextAnchorLocatorInContent('aaaa', original)).toBe(original);
  expect(repairTextAnchorLocatorInContent('prefix😀unique suffix', { from: 0, to: 6, originalText: 'unique' }))
    .toEqual({ from: 8, to: 14, originalText: 'unique' });
  expect(repairTextAnchorLocatorInContent('xaaaa', { from: 0, to: 2, originalText: 'aa' })).toBeNull();
  expect(repairTextAnchorLocatorInContent('other', original)).toBeNull();
});
