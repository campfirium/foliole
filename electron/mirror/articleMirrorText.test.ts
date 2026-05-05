// @vitest-environment node

import { describe, expect, it } from 'vitest';

import {
  compactNoteText,
  normalizeComparableText,
  normalizeClozeComparableText,
  preserveNoteLines,
  stripAnchorTags
} from './articleMirrorText.js';

describe('articleMirrorText', () => {
  it('keeps plain text unchanged while normalizing comparable text', () => {
    const value = 'Alpha\nBeta';

    expect(stripAnchorTags(value)).toBe('Alpha\nBeta');
    expect(normalizeComparableText(value)).toBe('Alpha Beta');
    expect(compactNoteText(value)).toBe('Alpha Beta');
    expect(preserveNoteLines(value)).toBe('Alpha\nBeta');
  });

  it('normalizes placeholder variants in plain cloze text', () => {
    expect(normalizeClozeComparableText('Before 【...】 After')).toBe('Before[...]After');
  });
});
