// @vitest-environment node

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const { importImageAttachmentBytes, resolveImageMimeType, normalizeImageFileName } = vi.hoisted(() => ({
  importImageAttachmentBytes: vi.fn(),
  normalizeImageFileName: vi.fn((value: string) => value || 'pasted-image.png'),
  resolveImageMimeType: vi.fn()
}));

vi.mock('./importImageAttachmentBytes.js', () => ({
  importImageAttachmentBytes,
  normalizeImageFileName,
  resolveImageMimeType
}));

import { importRemoteImageAttachment } from './importRemoteImageAttachment.js';
import { resolveRemoteImageCacheFilePathsForTests } from './remoteImageCache.js';
import {
  configureRemoteImageFetchTransportForTests,
  configureRemoteImageHostResolverForTests,
  configureRemoteImagePipelineCacheRoot,
  fetchRemoteImageResource,
  resetRemoteImagePipelineForTests,
  resolveRemoteImageSourceCacheKey
} from './remoteImagePipeline.js';

let tempRoot: string;
const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const WEBP_BYTES = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);

beforeEach(async () => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  resetRemoteImagePipelineForTests();
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-remote-image-cache-'));
  configureTestCacheRoot();
});

afterEach(async () => {
  await fs.rm(tempRoot, { force: true, recursive: true });
});

function configureTestCacheRoot() {
  configureRemoteImagePipelineCacheRoot(tempRoot);
  configureRemoteImageHostResolverForTests(async () => ['93.184.216.34']);
}

it('downloads a remote image and forwards it into CAS storage', async () => {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(PNG_BYTES, {
      headers: { 'content-type': 'image/png' },
      status: 200
    })
  );
  vi.stubGlobal('fetch', fetchMock);
  importImageAttachmentBytes.mockResolvedValue({ status: 'imported', attachment_id: 'hash-1' });

  await expect(
    importRemoteImageAttachment({
      nodeId: 'node-1',
      sourceUrl: 'https://example.com/images/cover.png'
    })
  ).resolves.toEqual({ status: 'imported', attachment_id: 'hash-1' });

  expect(importImageAttachmentBytes).toHaveBeenCalledWith(
    expect.objectContaining({
      errorSource: 'https://example.com/images/cover.png',
      mimeType: 'image/png',
      nodeId: 'node-1',
      originalName: 'cover.png'
    })
  );
});

it('uses the configured runtime fetch transport before writing the render cache', async () => {
  const fetchTransport = vi.fn().mockResolvedValue(
    new Response(PNG_BYTES, {
      headers: { 'content-type': 'image/png' },
      status: 200
    })
  );
  configureRemoteImageFetchTransportForTests(fetchTransport);

  await expect(fetchRemoteImageResource('https://example.com/images/runtime.png')).resolves.toMatchObject({
    resource: { bytes: PNG_BYTES, mimeType: 'image/png' },
    status: 'ready'
  });
  expect(fetchTransport).toHaveBeenCalledWith(
    'https://example.com/images/runtime.png',
    expect.objectContaining({
      headers: expect.objectContaining({ Accept: 'image/*,*/*;q=0.8' }),
      redirect: 'manual'
    })
  );
});

it('falls back to url extension when the response omits content-type', async () => {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(WEBP_BYTES, {
      status: 200
    })
  );
  vi.stubGlobal('fetch', fetchMock);
  resolveImageMimeType.mockReturnValue('image/webp');
  importImageAttachmentBytes.mockResolvedValue({ status: 'imported', attachment_id: 'hash-2' });

  await importRemoteImageAttachment({
    nodeId: 'node-1',
    sourceUrl: 'https://example.com/images/cover.webp'
  });

  expect(resolveImageMimeType).toHaveBeenCalledWith('https://example.com/images/cover.webp');
  expect(importImageAttachmentBytes).toHaveBeenCalledWith(
    expect.objectContaining({
      mimeType: 'image/webp'
    })
  );
});

it('shares concurrent imports for the same node and remote source', async () => {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(PNG_BYTES, {
      headers: { 'content-type': 'image/png' },
      status: 200
    })
  );
  vi.stubGlobal('fetch', fetchMock);
  importImageAttachmentBytes.mockResolvedValue({ status: 'imported', attachment_id: 'hash-1' });

  await Promise.all([
    importRemoteImageAttachment({ nodeId: 'node-1', sourceUrl: 'https://example.com/images/cover.png#preview' }),
    importRemoteImageAttachment({ nodeId: 'node-1', sourceUrl: 'https://EXAMPLE.com/images/cover.png' })
  ]);

  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(importImageAttachmentBytes).toHaveBeenCalledTimes(1);
});

it('returns a non-blocking error when the download fails', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));

  await expect(
    importRemoteImageAttachment({
      nodeId: 'node-1',
      sourceUrl: 'https://example.com/images/cover.png'
    })
  ).resolves.toEqual({
    status: 'error',
    error_code: 'download_failed',
    message: 'The remote image could not be downloaded.',
    source_path: 'https://example.com/images/cover.png'
  });
});

it('serves a cached remote image after the network becomes unavailable', async () => {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(PNG_BYTES, {
      headers: { 'content-type': 'image/png' },
      status: 200
    })
  );
  vi.stubGlobal('fetch', fetchMock);

  await expect(fetchRemoteImageResource('https://example.com/images/cover.png')).resolves.toMatchObject({
    resource: { bytes: PNG_BYTES, mimeType: 'image/png' },
    status: 'ready'
  });
  resetRemoteImagePipelineForTests();
  configureTestCacheRoot();
  fetchMock.mockRejectedValue(new Error('offline'));

  await expect(fetchRemoteImageResource('https://example.com/images/cover.png')).resolves.toMatchObject({
    resource: { bytes: PNG_BYTES, mimeType: 'image/png' },
    status: 'ready'
  });
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it('falls back to the remote source when a cached file is corrupted', async () => {
  const fetchMock = vi.fn().mockResolvedValueOnce(
    new Response(PNG_BYTES, {
      headers: { 'content-type': 'image/png' },
      status: 200
    })
  ).mockResolvedValueOnce(
    new Response(PNG_BYTES, {
      headers: { 'content-type': 'image/png' },
      status: 200
    })
  );
  vi.stubGlobal('fetch', fetchMock);

  await fetchRemoteImageResource('https://example.com/images/cover.png');
  const cacheKey = resolveRemoteImageSourceCacheKey('https://example.com/images/cover.png');
  const cachePaths = cacheKey ? resolveRemoteImageCacheFilePathsForTests(cacheKey) : null;
  expect(cachePaths).not.toBeNull();
  await fs.writeFile(cachePaths!.bytesPath, new Uint8Array([9]));
  resetRemoteImagePipelineForTests();
  configureTestCacheRoot();

  await expect(fetchRemoteImageResource('https://example.com/images/cover.png')).resolves.toMatchObject({
    resource: { bytes: PNG_BYTES },
    status: 'ready'
  });
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

it('keeps the downloaded image renderable when cache writes fail', async () => {
  const blockingFile = path.join(tempRoot, 'not-a-directory');
  await fs.writeFile(blockingFile, '');
  configureRemoteImagePipelineCacheRoot(path.join(blockingFile, 'remote-images'));
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
    new Response(PNG_BYTES, {
      headers: { 'content-type': 'image/png' },
      status: 200
    })
  ));

  await expect(fetchRemoteImageResource('https://example.com/images/cover.png')).resolves.toMatchObject({
    resource: { bytes: PNG_BYTES },
    status: 'ready'
  });
});
