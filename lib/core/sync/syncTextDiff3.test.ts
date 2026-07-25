// @vitest-environment node

import { expect, it } from 'vitest';

import { mergeSyncText } from './syncTextDiff3.js';

it('accepts identical and one-sided body edits', () => {
  expect(mergeSyncText('A\n', 'A\n', 'B\n')).toEqual({ kind: 'merged', text: 'B\n' });
  expect(mergeSyncText('A\n', 'B\n', 'B\n')).toEqual({ kind: 'merged', text: 'B\n' });
});

it('merges non-overlapping line edits from both branches', () => {
  expect(mergeSyncText('A\nB\nC\n', 'A1\nB\nC\n', 'A\nB\nC1\n')).toEqual({
    kind: 'merged',
    text: 'A1\nB\nC1\n'
  });
});

it('refuses overlapping edits instead of guessing', () => {
  expect(mergeSyncText('apple\n', 'banana\n', 'orange\n')).toEqual({ kind: 'conflict' });
});
