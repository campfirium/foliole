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
  app: { getPath: vi.fn(() => '/tmp/foliole-user-data') },
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

vi.mock('./remoteImageSourceContext.js', () => ({
  resolveRemoteImageSourceContext: vi.fn(() => ({ sourceOrigin: null }))
}));

import { buildRemoteImageRenderUrl } from '../../lib/platform/remoteImageProtocolUrl.js';

import {
  configureRemoteImageHostResolverForTests,
  importRemoteImageAttachment,
  resetRemoteImagePipelineForTests
} from './remoteImagePipeline.js';
import { registerRemoteImageProtocol } from './remoteImageProtocol.js';

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  resetRemoteImagePipelineForTests();
  configureRemoteImageHostResolverForTests(async () => ['93.184.216.34']);
});

it('shares one remote fetch across protocol renders and auto localization', async () => {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(PNG_BYTES, {
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
