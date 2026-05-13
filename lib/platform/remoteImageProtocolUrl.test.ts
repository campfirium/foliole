import { describe, expect, it } from 'vitest';

import { buildRemoteImageRenderUrl, parseRemoteImageRenderUrl } from './remoteImageProtocolUrl.js';

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
      sourceUrl: 'https://example.com/gallery/(cover).png?size=large#hero'
    });
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
      sourceUrl: 'https://example.com/cover.png'
    });
  });
});
