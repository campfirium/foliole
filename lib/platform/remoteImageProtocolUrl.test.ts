import { expect, it } from 'vitest';

import {
  buildRemoteImageRenderUrl,
  parseRemoteImageRenderUrl,
  REMOTE_IMAGE_RENDER_VERSION
} from './remoteImageProtocolUrl.js';

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
      sourceOrigin: null,
      sourceProvenance: 'none',
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
      sourceOrigin: null,
      sourceProvenance: 'none',
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
      sourceOrigin: null,
      sourceProvenance: 'none',
      sourceUrl: 'https://example.com/cover.png'
    });
  });

  it('carries only normalized origin and provenance across the protocol boundary', () => {
    const url = buildRemoteImageRenderUrl({
      nodeId: 'node-1',
      persist: false,
      sourceOrigin: 'https://source.example/article?id=1#section',
      sourceProvenance: 'node',
      sourceUrl: 'https://cdn.example/cover.png'
    });

    expect(parseRemoteImageRenderUrl(url)).toMatchObject({
      sourceOrigin: 'https://source.example/', sourceProvenance: 'node'
    });
    expect(url).not.toContain('article');
    expect(url).not.toContain('section');
  });

  it('ignores unrecognized provenance from an untrusted protocol URL', () => {
    const url = new URL('foliole-remote-image://render');
    url.searchParams.set('source', 'https://cdn.example/image.png');
    url.searchParams.set('origin', 'https://source.example/article');
    url.searchParams.set('provenance', 'forged');

    expect(parseRemoteImageRenderUrl(url.toString())).toMatchObject({
      sourceOrigin: null,
      sourceProvenance: 'none'
    });
  });
