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
  it('strips opaque anchor tags from comparable text', () => {
    const value = '<highlight id="anchor-1">Alpha</highlight id="anchor-1">\n<cloze id="anchor-2">Beta</cloze id="anchor-2">';

    expect(stripAnchorTags(value)).toBe('Alpha\nBeta');
    expect(normalizeComparableText(value)).toBe('Alpha Beta');
    expect(compactNoteText(value)).toBe('Alpha Beta');
    expect(preserveNoteLines(value)).toBe('Alpha\nBeta');
  });

  it('normalizes placeholder variants after stripping opaque anchors', () => {
    const value = 'Before <cloze id="anchor-2">answer</cloze id="anchor-2"> After';

    expect(normalizeClozeComparableText(value.replace('answer', '【...】'))).toBe('Before[...]After');
  });
});
