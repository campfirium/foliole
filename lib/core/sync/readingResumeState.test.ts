import { expect, it } from 'vitest';

import { advanceReadingResume, mergeReadingResumeStates, readReadingResumeOffset } from './readingResumeState.js';

const CONTENT = 'a'.repeat(64);
const EDITED_CONTENT = 'b'.repeat(64);

it('uses the last position on the same reading path, even after moving back', () => {
  const first = advanceReadingResume(null, CONTENT, 'A', 2000);
  const back = advanceReadingResume(first, CONTENT, 'A', 300);
  expect(readReadingResumeOffset(mergeReadingResumeStates(back, first), CONTENT)).toBe(300);
  expect(mergeReadingResumeStates(first, back)).toEqual(back);
});

it('uses the farther concurrent position and retains the other branch for a late third device', () => {
  const base = advanceReadingResume(null, CONTENT, 'A', 1000);
  const a = advanceReadingResume(base, CONTENT, 'A', 6000);
  const b = advanceReadingResume(base, CONTENT, 'B', 4500);
  const joined = mergeReadingResumeStates(a, b);
  expect(readReadingResumeOffset(joined, CONTENT)).toBe(6000);
  expect(mergeReadingResumeStates(b, a)).toEqual(joined);

  const c = advanceReadingResume(a, CONTENT, 'C', 3000);
  const received = mergeReadingResumeStates(joined, c);
  expect(readReadingResumeOffset(received, CONTENT)).toBe(4500);
  expect(mergeReadingResumeStates(mergeReadingResumeStates(c, b), a)).toEqual(received);

  const latest = advanceReadingResume(received, CONTENT, 'A', 1000);
  expect(readReadingResumeOffset(latest, CONTENT)).toBe(1000);
  expect(mergeReadingResumeStates(mergeReadingResumeStates(latest, a), b)).toEqual(latest);
});

it('only restores positions for the current body', () => {
  const original = advanceReadingResume(null, CONTENT, 'A', 6000);
  const edited = advanceReadingResume(original, EDITED_CONTENT, 'B', 3000);
  expect(readReadingResumeOffset(edited, CONTENT)).toBeUndefined();
  expect(readReadingResumeOffset(edited, EDITED_CONTENT)).toBe(3000);
});
