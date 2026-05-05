import { describe, expect, it } from 'vitest';

import { buildImageClozeSourcePayload } from './imageCloze';

describe('buildImageClozeSourcePayload', () => {
  it('keeps the mixed content while stripping unrelated images', () => {
    const content = [
      'First paragraph.',
      '',
      '![Cover](asset://hash-1.png)',
      '',
      'Second paragraph.',
      '',
      '![Other](asset://hash-2.png)',
      '',
      'Third paragraph.'
    ].join('\n');
    const imageMarkdown = '![Cover](asset://hash-1.png)';
    const from = content.indexOf(imageMarkdown);
    const to = from + imageMarkdown.length;

    const payload = buildImageClozeSourcePayload(content, { from, to });

    expect(payload).toEqual({
      promptContent: 'First paragraph.\n\n![Cover](asset://hash-1.png)\n\nSecond paragraph.\n\nThird paragraph.',
      revealContent: '![Cover](asset://hash-1.png)'
    });
  });

  it('keeps inline text around the target image inside the same block', () => {
    const content = 'Label before ![Map](asset://hash-1.png) label after';
    const imageMarkdown = '![Map](asset://hash-1.png)';
    const from = content.indexOf(imageMarkdown);
    const to = from + imageMarkdown.length;

    const payload = buildImageClozeSourcePayload(content, { from, to });

    expect(payload).toEqual({
      promptContent: 'Label before ![Map](asset://hash-1.png) label after',
      revealContent: '![Map](asset://hash-1.png)'
    });
  });
});
