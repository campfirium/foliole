import { expect, it } from 'vitest';

import { projectNodeInlineContent } from '../database/nodeInlineProjection.js';

import { BodyFrontmatterRange } from './bodyFrontmatterRange.js';

function scan(text: string, chunkBytes: number) {
  const scanner = new BodyFrontmatterRange();
  const bytes = new TextEncoder().encode(text);
  for (let offset = 0; offset < bytes.byteLength; offset += chunkBytes) {
    scanner.push(bytes.subarray(offset, offset + chunkBytes));
  }
  const end = scanner.finish();
  if (end === null) return { end, projection: '' };
  const prefix = new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes.subarray(0, end)).replace(/\r\n/gu, '\n');
  return { end, projection: prefix.endsWith('\n') ? prefix : `${prefix}\n` };
}

it.each([
  '', '---', 'plain\n---\n', '----\n---\n', '- - -\n---\n',
  '---\n---\nbody', '---\r\n中文: 😀\r\n---\r\nbody',
  '\ufeff \t---\r\nkey: value\n \t---\r',
  '---\n---', '---\nkey: value\n---\n',
  '---\n\u2028---\u2029\nbody', '---\n----\nbody',
  '---\nkey: value\n---  body\n',
  'x'.repeat(3 * 1024 * 1024),
  '---\n' + 'x'.repeat(3 * 1024 * 1024 - 8) + '\n---',
  '---\n' + 'x'.repeat(3 * 1024 * 1024 - 4)
])('keeps the existing frontmatter delimiter and newline semantics', (text) => {
  const expected = projectNodeInlineContent(text);
  const sizes = text.length > 1024 ? [512 * 1024] : [1, 2, 3, 7, 512 * 1024];
  for (const size of sizes) expect(scan(text, size).projection).toBe(expected);
});

it('records a byte range through the first closing delimiter without retaining the prefix', () => {
  const text = '---\nkey: 中文😀\n---\n---\nbody';
  const expectedPrefix = '---\nkey: 中文😀\n---\n';
  expect(scan(text, 1).end).toBe(new TextEncoder().encode(expectedPrefix).byteLength);
});
