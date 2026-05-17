// @vitest-environment node

import { beforeEach, expect, it, vi } from 'vitest';

const { handle, registerSchemesAsPrivileged } = vi.hoisted(() => ({
  handle: vi.fn(),
  registerSchemesAsPrivileged: vi.fn()
}));

const { fetchRemoteImageResource, importRemoteImageAttachment } = vi.hoisted(() => ({
  fetchRemoteImageResource: vi.fn(),
  importRemoteImageAttachment: vi.fn()
}));
const { resolveRemoteImageSourceContext } = vi.hoisted(() => ({
  resolveRemoteImageSourceContext: vi.fn()
}));

vi.mock('electron', () => ({
  protocol: {
    handle,
    registerSchemesAsPrivileged
  }
}));

vi.mock('./remoteImagePipeline.js', () => ({
  fetchRemoteImageResource,
  importRemoteImageAttachment
}));

vi.mock('./remoteImageSourceContext.js', () => ({
  resolveRemoteImageSourceContext
}));

import { buildRemoteImageRenderUrl, REMOTE_IMAGE_PROTOCOL_SCHEME } from '../../lib/platform/remoteImageProtocolUrl.js';

import {
  registerRemoteImageProtocol,
  registerRemoteImageProtocolScheme
} from './remoteImageProtocol.js';

beforeEach(() => {
  vi.clearAllMocks();
  resolveRemoteImageSourceContext.mockReturnValue({
    imageHost: 'example.com',
    learnedSourceOrigin: null,
    source: 'none',
    sourceOrigin: null
  });
});

it('registers the remote image scheme with secure standard privileges', () => {
  registerRemoteImageProtocolScheme();

  expect(registerSchemesAsPrivileged).toHaveBeenCalledWith([
    {
      scheme: REMOTE_IMAGE_PROTOCOL_SCHEME,
      privileges: {
        secure: true,
        standard: true,
        supportFetchAPI: true
      }
    }
  ]);
});

it('serves a preview-only remote image without persisting it', async () => {
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
});

it('resolves the source origin from the node id without exposing it in the render URL', async () => {
  resolveRemoteImageSourceContext.mockReturnValue({
    imageHost: 'cdn.example',
    learnedSourceOrigin: null,
    source: 'node',
    sourceOrigin: 'https://source.example/'
  });
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
    sourceUrl: 'https://cdn.example/cover.png'
  });
  const response = await handler({ url });

  expect(url).not.toContain('sourceOrigin');
  expect(resolveRemoteImageSourceContext).toHaveBeenCalledWith('node-1', 'https://cdn.example/cover.png');
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
