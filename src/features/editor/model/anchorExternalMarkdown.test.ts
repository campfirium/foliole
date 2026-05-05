import { describe, expect, it } from 'vitest';

import { renderExternalMarkdownWithAnchorRanges } from './anchorExternalMarkdown';

describe('anchorExternalMarkdown', () => {
  it('renders locator-backed anchor ranges into external markdown', () => {
    expect(
      renderExternalMarkdownWithAnchorRanges('Before important later', [
        { from: 7, kind: 'highlight', to: 16 },
        { from: 17, kind: 'cloze', to: 22 }
      ])
    ).toBe('Before ==important== <u>later</u>');
  });
});
