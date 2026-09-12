// @vitest-environment node

import { beforeEach, expect, it, vi } from 'vitest';

const { handle } = vi.hoisted(() => ({
  handle: vi.fn()
}));

const { fetchRemoteImageResource, importRemoteImageAttachment } = vi.hoisted(() => ({
  fetchRemoteImageResource: vi.fn(),
  importRemoteImageAttachment: vi.fn()
}));

vi.mock('electron', () => ({
  protocol: {
    handle
  }
}));

vi.mock('./remoteImagePipeline.js', () => ({
  fetchRemoteImageResource,
  importRemoteImageAttachment
}));

import { buildRemoteImageRenderUrl, REMOTE_IMAGE_PROTOCOL_SCHEME } from '../../lib/platform/remoteImageProtocolUrl.js';

import {
  registerRemoteImageProtocol
} from './remoteImageProtocol.js';

beforeEach(() => {
  vi.clearAllMocks();
});

it('serves preview-only remote image resources with mime and cache headers but no page CSP', async () => {
  fetchRemoteImageResource.mockResolvedValue({
    status: 'ready',
    resource: {
      bytes: new Uint8Array([1, 2, 3]),
      mimeType: 'image/png'
    }
  });

  registerRemoteImageProtocol();
  const handler = handle.mock.calls[0]?.[1];
  const response = await handler({
    url: buildRemoteImageRenderUrl({
      nodeId: null,
      persist: false,
      sourceUrl: 'https://example.com/cover.png'
    })
  });

  expect(fetchRemoteImageResource).toHaveBeenCalledWith('https://example.com/cover.png', {
    bypassFailureCache: false,
    sourceOrigin: null
  });
  expect(importRemoteImageAttachment).not.toHaveBeenCalled();
  expect(response.status).toBe(200);
  expect(response.headers.get('content-type')).toBe('image/png');
  expect(response.headers.get('content-security-policy')).toBeNull();
  expect(response.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
});

it('uses the minimal normalized source context carried by the render URL', async () => {
  fetchRemoteImageResource.mockResolvedValue({
    status: 'ready',
    resource: {
      bytes: new Uint8Array([1, 2, 3]),
      mimeType: 'image/png'
    }
  });

  registerRemoteImageProtocol();
  const handler = handle.mock.calls[0]?.[1];
  const url = buildRemoteImageRenderUrl({
    nodeId: 'node-1',
    persist: false,
    sourceOrigin: 'https://source.example/article?id=1',
    sourceProvenance: 'node',
    sourceUrl: 'https://cdn.example/cover.png'
  });
  const response = await handler({ url });

  expect(url).not.toContain('article');
  expect(fetchRemoteImageResource).toHaveBeenCalledWith('https://cdn.example/cover.png', {
    bypassFailureCache: false,
    sourceOrigin: 'https://source.example/'
  });
  expect(response.status).toBe(200);
});

it('persists the image when the render URL requests node-backed localization', async () => {
  fetchRemoteImageResource.mockResolvedValue({
    status: 'ready',
    resource: {
      bytes: new Uint8Array([1, 2, 3]),
      mimeType: 'image/png'
    }
  });
  importRemoteImageAttachment.mockResolvedValue({ status: 'imported', attachment_id: 'hash-1' });

  registerRemoteImageProtocol();
  const handler = handle.mock.calls[0]?.[1];
  const response = await handler({
    url: buildRemoteImageRenderUrl({
      nodeId: 'node-1',
      persist: true,
      sourceUrl: 'https://example.com/cover.png'
    })
  });

  expect(importRemoteImageAttachment).toHaveBeenCalledWith({
    nodeId: 'node-1',
    sourceUrl: 'https://example.com/cover.png'
  });
  expect(response.status).toBe(200);
});

it('keeps rendering the remote image when node-backed localization fails', async () => {
  fetchRemoteImageResource.mockResolvedValue({
    status: 'ready',
    resource: {
      bytes: new Uint8Array([1, 2, 3]),
      mimeType: 'image/png'
    }
  });
  importRemoteImageAttachment.mockResolvedValue({ status: 'error', error_code: 'storage_write_failed' });

  registerRemoteImageProtocol();
  const handler = handle.mock.calls[0]?.[1];
  const response = await handler({
    url: buildRemoteImageRenderUrl({
      nodeId: 'node-1',
      persist: true,
      sourceUrl: 'https://example.com/cover.png'
    })
  });

  expect(importRemoteImageAttachment).toHaveBeenCalledWith({
    nodeId: 'node-1',
    sourceUrl: 'https://example.com/cover.png'
  });
  expect(response.status).toBe(200);
  expect(response.headers.get('content-type')).toBe('image/png');
});

it('rejects persist requests without a node id', async () => {
  registerRemoteImageProtocol();
  const handler = handle.mock.calls[0]?.[1];
  const response = await handler({
    url: `${REMOTE_IMAGE_PROTOCOL_SCHEME}://render?source=https%3A%2F%2Fexample.com%2Fcover.png&persist=1`
  });

  expect(response.status).toBe(400);
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(response.headers.get('x-foliole-image-error')).toBe('download_failed');
  expect(fetchRemoteImageResource).not.toHaveBeenCalled();
});

it('returns not found when the remote image cannot be loaded', async () => {
  fetchRemoteImageResource.mockResolvedValue({
    status: 'error',
    error: { status: 'error', error_code: 'download_failed' }
  });

  registerRemoteImageProtocol();
  const handler = handle.mock.calls[0]?.[1];
  const response = await handler({
    url: buildRemoteImageRenderUrl({
      nodeId: null,
      persist: false,
      sourceUrl: 'https://example.com/missing.png'
    })
  });

  expect(response.status).toBe(404);
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(response.headers.get('x-foliole-image-error')).toBe('download_failed');
});
