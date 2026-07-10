// @vitest-environment node

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const { importImageAttachmentBytes, normalizeImageFileName, resolveImageMimeType } = vi.hoisted(() => ({
  importImageAttachmentBytes: vi.fn(),
  normalizeImageFileName: vi.fn((value: string) => value || 'pasted-image.png'),
  resolveImageMimeType: vi.fn()
}));

vi.mock('./importImageAttachmentBytes.js', () => ({
  importImageAttachmentBytes,
  normalizeImageFileName,
  resolveImageMimeType
}));

import {
  configureRemoteImageHostResolverForTests,
  configureRemoteImagePipelineCacheRoot,
  fetchRemoteImageResource,
  importRemoteImageAttachment,
  resetRemoteImagePipelineForTests
} from './remoteImagePipeline.js';

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

let tempRoot: string;

beforeEach(async () => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  resetRemoteImagePipelineForTests();
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-remote-image-cache-'));
  configureRemoteImagePipelineCacheRoot(tempRoot);
  configureRemoteImageHostResolverForTests(async () => ['93.184.216.34']);
});

afterEach(async () => {
  await fs.rm(tempRoot, { force: true, recursive: true });
});

it('imports from the remote image cache without downloading again', async () => {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(PNG_BYTES, {
      headers: { 'content-type': 'image/png' },
      status: 200
    })
  );
  vi.stubGlobal('fetch', fetchMock);
  importImageAttachmentBytes.mockResolvedValue({ status: 'imported', attachment_id: 'hash-1' });

  await fetchRemoteImageResource('https://example.com/images/cover.png');
  resetRemoteImagePipelineForTests();
  configureRemoteImagePipelineCacheRoot(tempRoot);
  configureRemoteImageHostResolverForTests(async () => ['93.184.216.34']);
  fetchMock.mockRejectedValue(new Error('offline'));

  await expect(importRemoteImageAttachment({
    nodeId: 'node-1',
    sourceUrl: 'https://example.com/images/cover.png'
  })).resolves.toEqual({ status: 'imported', attachment_id: 'hash-1' });
  expect(importImageAttachmentBytes).toHaveBeenCalledWith(expect.objectContaining({
    bytes: PNG_BYTES
  }));
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
