import { describe, expect, it } from 'vitest';

import { remapTextAnchorLocator, repairTextAnchorLocatorInContent } from './textAnchorLocator.js';

describe('text anchor locator remap', () => {
  it('keeps anchors aligned through multiple image rewrites before and after the anchor', () => {
    const previousContent = [
      '![One](one.png)',
      'Target sentence.',
      '![Two](two.png)'
    ].join('\n\n');
    const nextContent = [
      '![One](asset://attachment-one.png)',
      'Target sentence.',
      '![Two](asset://attachment-two.png)'
    ].join('\n\n');
    const from = previousContent.indexOf('Target sentence.');

    expect(
      remapTextAnchorLocator(nextContent, {
        from,
        originalText: 'Target sentence.',
        to: from + 'Target sentence.'.length
      }, previousContent)
    ).toEqual({
      from: nextContent.indexOf('Target sentence.'),
      originalText: 'Target sentence.',
      to: nextContent.indexOf('Target sentence.') + 'Target sentence.'.length
    });
  });

  it('uses surrounding context when the original text is duplicated', () => {
    const previousContent = 'first Beta\n\n![Cover](cover.png)\n\nsecond Beta';
    const nextContent = 'first Beta\n\n![Cover](asset://cover.png)\n\nsecond Beta';
    const from = previousContent.lastIndexOf('Beta');

    expect(
      remapTextAnchorLocator(nextContent, {
        from,
        originalText: 'Beta',
        to: from + 'Beta'.length
      }, previousContent)
    ).toEqual({
      from: nextContent.lastIndexOf('Beta'),
      originalText: 'Beta',
      to: nextContent.lastIndexOf('Beta') + 'Beta'.length
    });
  });

  it('returns null for repair when the original text is not unique', () => {
    expect(
      repairTextAnchorLocatorInContent('Alpha Beta Beta', {
        from: 0,
        originalText: 'Beta',
        to: 4
      })
    ).toBeNull();
  });
});
