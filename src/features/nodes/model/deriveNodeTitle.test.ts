import { describe, expect, it } from 'vitest';

import { deriveNodeTitleForCloze, deriveNodeTitleFromContent, deriveNextUntitledNodeTitle, UNTITLED_NODE_TITLE } from './deriveNodeTitle';

describe('deriveNodeTitle', () => {
  it('derives a title from plain markdown headings and text', () => {
    expect(deriveNodeTitleFromContent('# Important title\n\nBody')).toBe('Important title');
    expect(deriveNodeTitleFromContent('Before answer After')).toBe('Before answer After');
  });

  it('keeps body edits from changing a fallback title', () => {
    expect(deriveNodeTitleFromContent('Stable title\n\nBody typed later')).toBe('Stable title');
    expect(deriveNodeTitleFromContent('\n\n- Stable list title\n\nBody typed later')).toBe('Stable list title');
  });

  it('derives a cloze title from the prompt first and falls back to the answer', () => {
    expect(deriveNodeTitleForCloze('Prompt title', 'Answer title')).toBe('Prompt title');
    expect(deriveNodeTitleForCloze('', 'Answer title')).toBe('Answer title');
  });

  it('keeps untitled sequencing stable', () => {
    expect(deriveNextUntitledNodeTitle([UNTITLED_NODE_TITLE, 'Untitled 2', 'Atlas'])).toBe('Untitled 3');
  });

  it('derives a stable title for image-only markdown content', () => {
    expect(deriveNodeTitleFromContent('![](asset://hash.png)')).toBe('Image highlight');
    expect(deriveNodeTitleFromContent('![Cover](asset://hash.png)')).toBe('Cover');
  });
});
