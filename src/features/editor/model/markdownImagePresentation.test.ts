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
    browserImageSrc: source,
    display: 'inline',
    fallbackStatus: null,
    imageSrc: source,
    isRemote: false
  });
}

describe('markdownImagePresentation', () => {
  it('builds remote image render state', () => {
    expect(
      buildMarkdownImageRenderPlan({
        attachmentId: null,
        alt: 'Preview',
        display: 'inline',
        from: 0,
        source: 'https://example.com/a.png',
        to: 10
      })
    ).toEqual({
      attachmentProtocolSrc: null,
      browserImageSrc: null,
      display: 'inline',
      fallbackStatus: null,
      imageSrc: 'https://example.com/a.png',
      isRemote: true
    });
  });

  it('builds file image render state for resolved local preview resources', () => {
    expectBrowserImagePlan('file:///vault/images/cover.png');
  });

  it('builds data image render state for inline preview resources', () => {
    expectBrowserImagePlan('data:image/png;base64,abc123');
  });

  it('builds external document image protocol render state for external preview resources', () => {
    expectBrowserImagePlan(
      'foliole-ext-image://resource/?documentPath=%2Fvault%2Ftopic.md&imageDestination=images%2Fcover.png'
    );
  });

  it('builds svg data image render state for exported inline icons', () => {
    expectBrowserImagePlan('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTgiIGhlaWdodD0iMTgiPjwvc3ZnPg==');
  });

  it('does not build a browser image source for unsafe data resources', () => {
    expect(
      buildMarkdownImageRenderPlan({
        attachmentId: null,
        alt: 'Preview',
        display: 'inline',
        from: 0,
        source: 'data:text/html;base64,PGgxPk5vPC9oMT4=',
        to: 10
      })
    ).toEqual({
      attachmentProtocolSrc: null,
      browserImageSrc: null,
      display: 'inline',
      fallbackStatus: 'unavailable',
      imageSrc: null,
      isRemote: false
    });
  });
});

describe('markdownImagePresentation attachments', () => {
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
      browserImageSrc: null,
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
      browserImageSrc: null,
      display: 'inline',
      fallbackStatus: 'unavailable',
      imageSrc: null,
      isRemote: false
    });
  });
});
