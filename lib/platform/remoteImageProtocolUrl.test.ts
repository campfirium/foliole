import { describe, expect, it } from 'vitest';

import {
  buildRemoteImageRenderUrl,
  parseRemoteImageRenderUrl,
  REMOTE_IMAGE_RENDER_VERSION
} from './remoteImageProtocolUrl.js';

describe('remoteImageProtocolUrl', () => {
  it('round-trips render URLs with node-backed persistence', () => {
    const url = buildRemoteImageRenderUrl({
      nodeId: 'node-1',
      persist: true,
      sourceUrl: 'https://example.com/gallery/(cover).png?size=large#hero'
    });

    expect(parseRemoteImageRenderUrl(url)).toEqual({
      nodeId: 'node-1',
      persist: true,
      retryKey: null,
      sourceUrl: 'https://example.com/gallery/(cover).png?size=large#hero'
    });
    expect(new URL(url).searchParams.get('v')).toBe(REMOTE_IMAGE_RENDER_VERSION);
  });

  it('omits persistence when node id is missing', () => {
    const url = buildRemoteImageRenderUrl({
      nodeId: null,
      persist: true,
      sourceUrl: 'https://example.com/cover.png'
    });

    expect(parseRemoteImageRenderUrl(url)).toEqual({
      nodeId: null,
      persist: false,
      retryKey: null,
      sourceUrl: 'https://example.com/cover.png'
    });
  });

  it('keeps node context and retry nonce independent from persistence', () => {
    const url = buildRemoteImageRenderUrl({
      nodeId: 'node-1',
      persist: false,
      retryKey: 'retry-1',
      sourceUrl: 'https://example.com/cover.png'
    });

    expect(parseRemoteImageRenderUrl(url)).toEqual({
      nodeId: 'node-1',
      persist: false,
      retryKey: 'retry-1',
      sourceUrl: 'https://example.com/cover.png'
    });
  });
});
