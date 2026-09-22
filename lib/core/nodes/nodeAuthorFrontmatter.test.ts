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
