// @vitest-environment node

import { beforeEach, expect, it, vi } from 'vitest';

const { handle, registerSchemesAsPrivileged } = vi.hoisted(() => ({
  handle: vi.fn(),
  registerSchemesAsPrivileged: vi.fn()
}));

const { importImageAttachmentBytes, resolveImageMimeType, normalizeImageFileName } = vi.hoisted(() => ({
  importImageAttachmentBytes: vi.fn(),
  normalizeImageFileName: vi.fn((value: string) => value || 'pasted-image.png'),
  resolveImageMimeType: vi.fn()
}));

vi.mock('electron', () => ({
  protocol: {
    handle,
    registerSchemesAsPrivileged
  }
}));

vi.mock('./importImageAttachmentBytes.js', () => ({
  importImageAttachmentBytes,
  normalizeImageFileName,
  resolveImageMimeType
}));

import { buildRemoteImageRenderUrl } from '../../lib/platform/remoteImageProtocolUrl.js';

import { importRemoteImageAttachment, resetRemoteImagePipelineForTests } from './remoteImagePipeline.js';
import { registerRemoteImageProtocol } from './remoteImageProtocol.js';

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  resetRemoteImagePipelineForTests();
});

it('shares one remote fetch across protocol renders and auto localization', async () => {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(new Uint8Array([1, 2, 3]), {
      headers: { 'content-type': 'image/png' },
      status: 200
    })
  );
  vi.stubGlobal('fetch', fetchMock);
  importImageAttachmentBytes.mockResolvedValue({ status: 'imported', attachment_id: 'hash-1' });
  registerRemoteImageProtocol();
  const handler = handle.mock.calls[0]?.[1];
  const url = buildRemoteImageRenderUrl({
    nodeId: 'node-1',
    persist: true,
    sourceUrl: 'https://example.com/cover.png'
  });

  await Promise.all([
    handler({ url }),
    handler({ url }),
    importRemoteImageAttachment({ nodeId: 'node-1', sourceUrl: 'https://example.com/cover.png' })
  ]);

  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(importImageAttachmentBytes).toHaveBeenCalledTimes(1);
});
