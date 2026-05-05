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
});
