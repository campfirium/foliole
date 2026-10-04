import { describe, expect, it } from 'vitest';

import { appendImageClozeRegions, buildImageClozeSourcePayload } from './imageCloze';

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

describe('appendImageClozeRegions', () => {
  it('preserves frozen input, region order and first occurrence for duplicate ids', () => {
    const oldRegion = { id: 'old', x: 0.1, y: 0.2, width: 0.3, height: 0.4 };
    const target = { attachmentId: 'image', regions: [oldRegion] };
    const other = { attachmentId: 'other', regions: [{ ...oldRegion, id: 'other' }] };
    Object.freeze(target.regions);
    Object.freeze(target);
    const input = [other, target];
    Object.freeze(input);
    const draft = { ...oldRegion, attachmentId: 'image', answer: 'Answer' };
    const result = appendImageClozeRegions(input, 'image', [draft, { ...draft, id: 'new' }, { ...draft, id: 'new', x: 0.8 }]);
    expect(input).toEqual([other, { attachmentId: 'image', regions: [oldRegion] }]);
    expect(result[0]).toBe(other);
    expect(result[1]).not.toBe(target);
    expect(result[1]?.regions).toEqual([oldRegion, { ...oldRegion, id: 'new' }]);
  });

  it('adds a different attachment after the existing groups without changing them', () => {
    const oldRegion = { id: 'old', x: 0.1, y: 0.2, width: 0.3, height: 0.4 };
    const current = [{ attachmentId: 'first', regions: [oldRegion] }];
    const result = appendImageClozeRegions(current, 'second', [{ ...oldRegion, attachmentId: 'second', answer: 'Answer' }]);
    expect(result).toEqual([...current, { attachmentId: 'second', regions: [oldRegion] }]);
    expect(result[0]).toBe(current[0]);
  });
});
