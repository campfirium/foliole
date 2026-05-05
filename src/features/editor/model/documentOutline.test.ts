import { describe, expect, it } from 'vitest';

import { extractDocumentOutline } from './documentOutline';

describe('extractDocumentOutline', () => {
  it('collects markdown headings with their levels and text', () => {
    const content = ['# Title', '', '## Section One', 'Body', '### [Linked](https://example.com) detail'].join('\n');

    expect(extractDocumentOutline(content)).toEqual([
      { from: 2, level: 1, text: 'Title', to: 7 },
      { from: 12, level: 2, text: 'Section One', to: 23 },
      { from: 33, level: 3, text: 'Linked detail', to: 69 }
    ]);
  });

  it('ignores headings inside fences and keeps only real markdown headings', () => {
    const content = ['# Intro', '```md', '## Hidden', '```', '## Visible'].join('\n');

    expect(extractDocumentOutline(content)).toEqual([
      { from: 2, level: 1, text: 'Intro', to: 7 },
      { from: 31, level: 2, text: 'Visible', to: 38 }
    ]);
  });

  it('collects setext headings', () => {
    const content = ['Title', '===', 'Section', '---'].join('\n');

    expect(extractDocumentOutline(content)).toEqual([
      { from: 0, level: 1, text: 'Title', to: 9 },
      { from: 10, level: 2, text: 'Section', to: 21 }
    ]);
  });

  it('collects whole-line strong-wrapped ATX compatibility headings', () => {
    const content = ['**# Article Title**', '**## Deep dive**'].join('\n');

    expect(extractDocumentOutline(content)).toEqual([
      { from: 4, level: 1, text: 'Article Title', to: 19 },
      { from: 25, level: 2, text: 'Deep dive', to: 36 }
    ]);
  });
});
