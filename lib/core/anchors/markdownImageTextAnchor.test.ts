import { describe, expect, it } from 'vitest';

import { expandMarkdownImageTextLocator } from './markdownImageTextAnchor.js';
import { remapTextAnchorLocator } from './textAnchorLocator.js';

const FIRST_REMOTE = '![](https://example.com/very-long-first.png)';
const SECOND_REMOTE = '![](https://example.com/second.png)';
const FIRST_LOCAL = '![](asset://first.png)';
const SECOND_LOCAL = '![](asset://second.png)';

function locatorFor(content: string, text: string) {
  const from = content.indexOf(text);
  return { from, originalText: text, to: from + text.length };
}

function remapImageAnchor(previousContent: string, content: string, originalText: string) {
  const locator = locatorFor(previousContent, originalText);
  return expandMarkdownImageTextLocator(
    content,
    remapTextAnchorLocator(content, locator, previousContent),
    locator,
    previousContent
  );
}

describe('Markdown image text anchor remapping', () => {
  it('preserves a mixed trailing highlight through one contained image rewrite', () => {
    const previousHighlight = ['Penultimate.', SECOND_REMOTE, 'Final.'].join('\n\n');
    const nextHighlight = ['Penultimate.', SECOND_LOCAL, 'Final.'].join('\n\n');
    const previousContent = ['Title', FIRST_REMOTE, previousHighlight].join('\n\n');
    const content = ['Title', FIRST_REMOTE, nextHighlight].join('\n\n');

    expect(remapImageAnchor(previousContent, content, previousHighlight)).toEqual(
      locatorFor(content, nextHighlight)
    );
  });

  it('keeps a mixed highlight on the later image when several images are rewritten', () => {
    const previousHighlight = ['Penultimate.', SECOND_REMOTE, 'Final.'].join('\n\n');
    const nextHighlight = ['Penultimate.', SECOND_LOCAL, 'Final.'].join('\n\n');
    const previousContent = ['Title', FIRST_REMOTE, previousHighlight].join('\n\n');
    const content = ['Title', FIRST_LOCAL, nextHighlight].join('\n\n');

    expect(remapImageAnchor(previousContent, content, previousHighlight)).toEqual(
      locatorFor(content, nextHighlight)
    );
  });

  it('keeps trailing text when large-image localization moves an inline image onto its own block', () => {
    const previousHighlight = `${SECOND_REMOTE} trailing sentence.`;
    const nextHighlight = `${SECOND_LOCAL}\n\ntrailing sentence.`;
    const previousContent = `Lead ${previousHighlight}`;
    const content = `Lead\n\n${nextHighlight}`;

    expect(remapImageAnchor(previousContent, content, previousHighlight)).toEqual(
      locatorFor(content, nextHighlight)
    );
  });
});
