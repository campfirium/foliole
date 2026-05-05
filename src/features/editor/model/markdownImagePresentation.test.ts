import { describe, expect, it } from 'vitest';

import { buildMarkdownImageRenderPlan } from './markdownImagePresentation';

function expectBrowserImagePlan(source: string) {
  expect(
    buildMarkdownImageRenderPlan({
      attachmentId: null,
      alt: 'Preview',
      display: 'inline',
      from: 0,
      source,
      to: 10
    })
  ).toEqual({
    attachmentProtocolSrc: null,
    display: 'inline',
    fallbackStatus: null,
    imageSrc: source,
    isRemote: true
  });
}

describe('markdownImagePresentation', () => {
  it('builds remote image render state', () => {
    expectBrowserImagePlan('https://example.com/a.png');
  });

  it('builds file image render state for resolved local preview resources', () => {
    expectBrowserImagePlan('file:///vault/images/cover.png');
  });

  it('builds data image render state for inline preview resources', () => {
    expectBrowserImagePlan('data:image/png;base64,abc123');
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
