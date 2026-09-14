import { expect, it } from 'vitest';

import { collectMarkdownPrefixRanges } from './markdownBlockProjection';

it('tracks semantic list depth independently from source whitespace width', () => {
  const text = '- One\n  - Two\n    - Three\n      - [ ] Four';

  expect(collectMarkdownPrefixRanges(text).filter(({ listDepth }) => listDepth !== undefined).map(({ kind, listDepth }) => ({
    kind,
    listDepth
  }))).toEqual([
    { kind: 'unordered-list', listDepth: 0 },
    { kind: 'unordered-list', listDepth: 1 },
    { kind: 'unordered-list', listDepth: 2 },
    { kind: 'task-list', listDepth: 3 }
  ]);
});
