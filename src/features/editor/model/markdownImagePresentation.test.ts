import { describe, expect, it } from 'vitest';

import { buildMarkdownImageRenderPlan } from './markdownImagePresentation';

describe('markdownImagePresentation', () => {
  it('builds remote image render state', () => {
    expect(
      buildMarkdownImageRenderPlan({
        attachmentId: null,
        alt: 'Remote',
        display: 'inline',
        from: 0,
        source: 'https://example.com/a.png',
        to: 10
      })
    ).toEqual({
      attachmentProtocolSrc: null,
      display: 'inline',
      fallbackStatus: null,
      imageSrc: 'https://example.com/a.png',
      isRemote: true
    });
  });

  it('builds internal attachment image render state', () => {
    expect(
      buildMarkdownImageRenderPlan({
        attachmentId: 'hash-1',
        alt: 'Cover',
        display: 'block',
        from: 0,
        source: 'asset://hash-1.png',
        to: 10
      })
    ).toEqual({
      attachmentProtocolSrc: 'foliole-asset://attachment/hash-1',
      display: 'block',
      fallbackStatus: null,
      imageSrc: 'foliole-asset://attachment/hash-1',
      isRemote: false
    });
  });

  it('builds unavailable image fallback state when attachment id is missing', () => {
    expect(
      buildMarkdownImageRenderPlan({
        attachmentId: null,
        alt: 'Broken',
        display: 'inline',
        from: 0,
        source: 'asset://broken.png',
        to: 10
      })
    ).toEqual({
      attachmentProtocolSrc: null,
      display: 'inline',
      fallbackStatus: 'unavailable',
      imageSrc: null,
      isRemote: false
    });
  });
});
