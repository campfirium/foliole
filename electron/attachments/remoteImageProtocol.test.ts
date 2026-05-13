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

import { buildRemoteImageRenderUrl, REMOTE_IMAGE_PROTOCOL_SCHEME } from '../../lib/platform/remoteImageProtocolUrl.js';

import {
  registerRemoteImageProtocol,
  registerRemoteImageProtocolScheme
} from './remoteImageProtocol.js';

beforeEach(() => {
  vi.clearAllMocks();
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

  expect(fetchRemoteImageResource).toHaveBeenCalledWith('https://example.com/cover.png');
  expect(importRemoteImageAttachment).not.toHaveBeenCalled();
  expect(response.status).toBe(200);
  expect(response.headers.get('content-type')).toBe('image/png');
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

it('rejects persist requests without a node id', async () => {
  registerRemoteImageProtocol();
  const handler = handle.mock.calls[0]?.[1];
  const response = await handler({
    url: `${REMOTE_IMAGE_PROTOCOL_SCHEME}://render?source=https%3A%2F%2Fexample.com%2Fcover.png&persist=1`
  });

  expect(response.status).toBe(400);
  expect(fetchRemoteImageResource).not.toHaveBeenCalled();
});

it('returns not found when the remote image cannot be loaded or persisted', async () => {
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
});
