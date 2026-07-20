import { describe, expect, it } from 'vitest';

import { appendHighlightCardNote, parseHighlightCardContent } from './textAnnotationContent.js';

describe('text annotation content', () => {
  it('parses the original excerpt and replaces an existing note without nesting it', () => {
    const first = appendHighlightCardNote({
      content: 'Selected PDF text',
      note: 'First thought',
      originalText: 'Selected PDF text'
    });
    const parsed = parseHighlightCardContent({ content: first });
    const second = appendHighlightCardNote({
      content: first,
      note: 'Revised thought',
      originalText: parsed.text
    });

    expect(parsed).toEqual({ note: 'First thought', text: 'Selected PDF text' });
    expect(second).toBe('Selected PDF text\n※ Revised thought');
  });

  it('parses a configured annotation prefix', () => {
    expect(parseHighlightCardContent({ content: 'Excerpt\nNote: Detail', notePrefix: 'Note: ' })).toEqual({
      note: 'Detail',
      text: 'Excerpt'
    });
  });
});
