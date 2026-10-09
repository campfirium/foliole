import { expect, it } from 'vitest';

import { readNodeAuthorText } from './nodeAuthorFrontmatter.js';

it('reads scalar and list authors from frontmatter', () => {
  expect(readNodeAuthorText('---\nauthor: [[Ada Lovelace]]\n---\nBody')).toBe('Ada Lovelace');
  expect(readNodeAuthorText('---\nauthor:\n  - Ada\n  - [[Grace Hopper]]\n---\nBody')).toBe(
    'Ada, Grace Hopper'
  );
});

it('ignores author-like text outside leading frontmatter', () => {
  expect(readNodeAuthorText('Body\nauthor: Ada')).toBeNull();
});


it('reads scalar and list authors from BOM and CRLF frontmatter', () => {
  const content = '\ufeff---\r\nauthor:\r\n  - Ada\r\n  - [[Grace Hopper]]\r\n---\r\nBody 😀\r\n';
  expect(readNodeAuthorText(content)).toBe('Ada, Grace Hopper');
  expect(readNodeAuthorText('---\r\nauthor: Ada\r\n---\r\nBody')).toBe('Ada');
});
