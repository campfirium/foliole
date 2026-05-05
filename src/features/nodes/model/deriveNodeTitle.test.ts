import { describe, expect, it } from 'vitest';

import { deriveNodeTitleForCloze, deriveNodeTitleFromContent, deriveNextUntitledNodeTitle, UNTITLED_NODE_TITLE } from './deriveNodeTitle';

describe('deriveNodeTitle', () => {
  it('derives a title from opaque-id wrapped headings and text', () => {
    expect(
      deriveNodeTitleFromContent('<highlight id="anchor-1"># Important title</highlight id="anchor-1">\n\nBody')
    ).toBe('Important title');

    expect(
      deriveNodeTitleFromContent('Before <cloze id="anchor-2">answer</cloze id="anchor-2"> After')
    ).toBe('Before answer After');
  });

  it('derives a cloze title from the prompt first and falls back to the answer', () => {
    expect(
      deriveNodeTitleForCloze('<highlight id="anchor-1">Prompt title</highlight id="anchor-1">', 'Answer title')
    ).toBe('Prompt title');

    expect(
      deriveNodeTitleForCloze('', '<highlight id="anchor-2">Answer title</highlight id="anchor-2">')
    ).toBe('Answer title');
  });

  it('keeps untitled sequencing stable', () => {
    expect(deriveNextUntitledNodeTitle([UNTITLED_NODE_TITLE, 'Untitled 2', 'Atlas'])).toBe('Untitled 3');
  });
});
