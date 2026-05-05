import { describe, expect, it } from 'vitest';

import { convertAnchoredMarkdownToExternal, renderExternalMarkdownWithAnchorRanges } from './anchorExternalMarkdown';

describe('anchorExternalMarkdown', () => {
  it('converts highlights to external markdown markers', () => {
    expect(convertAnchoredMarkdownToExternal('<highlight id="1">Keep</highlight id="1"> and text')).toBe(
      '==Keep== and text'
    );
  });

  it('removes cloze tags while keeping the content', () => {
    expect(convertAnchoredMarkdownToExternal('<cloze id="2">Hide</cloze id="2"> later')).toBe('<u>Hide</u> later');
  });

  it('handles nested anchors without leaking raw tags', () => {
    expect(
      convertAnchoredMarkdownToExternal(
        '<highlight id="1">Alpha <cloze id="2">Beta</cloze id="2"></highlight id="1">'
      )
    ).toBe('==Alpha <u>Beta</u>==');
  });

  it('renders locator-backed anchor ranges into external markdown', () => {
    expect(
      renderExternalMarkdownWithAnchorRanges('Before important later', [
        { from: 7, kind: 'highlight', to: 16 },
        { from: 17, kind: 'cloze', to: 22 }
      ])
    ).toBe('Before ==important== <u>later</u>');
  });
});
