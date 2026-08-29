import { describe, expect, it } from 'vitest';

import {
  appendHighlightCardNote,
  parseExcerptAnnotationContent,
  parseHighlightCardContent,
  replaceExcerptAnnotation
} from './textAnnotationContent.js';

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

  it.each([
    ['text', 'Selected text'],
    ['whole image', '![Cover](asset://cover.png)'],
    ['cropped image', '![Excerpt](asset://crop.png)']
  ])('replaces the %s annotation without changing the excerpt body', (_kind, body) => {
    const first = replaceExcerptAnnotation({ content: body, note: 'First thought' });
    const second = replaceExcerptAnnotation({ content: first, note: 'Revised thought' });

    expect(parseExcerptAnnotationContent({ content: second })).toEqual({
      body,
      lineEnding: '\n',
      note: 'Revised thought'
    });
  });

  it('preserves original body bytes and treats a blank annotation as no write', () => {
    const content = '  ![Cover](asset://cover.png)  \r\n';

    expect(replaceExcerptAnnotation({ content, note: '  ' })).toBe(content);
    expect(replaceExcerptAnnotation({ content, note: 'Detail' })).toBe(`${content}\r\n※ Detail`);
  });
});
