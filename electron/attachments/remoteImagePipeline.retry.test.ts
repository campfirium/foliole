// @vitest-environment node

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const { learnRemoteImageSourceOrigin, normalizeImageFileName, resolveImageMimeType } = vi.hoisted(() => ({
  learnRemoteImageSourceOrigin: vi.fn(),
  normalizeImageFileName: vi.fn((value: string) => value || 'pasted-image.png'),
  resolveImageMimeType: vi.fn()
}));

vi.mock('./importImageAttachmentBytes.js', () => ({
  importImageAttachmentBytes: vi.fn(),
  normalizeImageFileName,
  resolveImageMimeType
}));

vi.mock('./remoteImageLearnedSources.js', () => ({
  learnRemoteImageSourceOrigin
}));

import {
  configureRemoteImageFetchTransportForTests,
  configureRemoteImagePipelineCacheRoot,
  fetchRemoteImageResource,
  resetRemoteImagePipelineForTests
} from './remoteImagePipeline.js';

let tempRoot: string;
const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff]);

beforeEach(async () => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  resetRemoteImagePipelineForTests();
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-remote-image-cache-'));
  configureRemoteImagePipelineCacheRoot(tempRoot);
});

afterEach(async () => {
  await fs.rm(tempRoot, { force: true, recursive: true });
});

it('rejects non-image responses even when the URL extension looks supported', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
    new Response(new TextEncoder().encode('<html></html>'), {
      headers: { 'content-type': 'text/html' },
      status: 200
    })
  ));

  await expect(fetchRemoteImageResource('https://example.com/images/cover.png')).resolves.toMatchObject({
    error: { error_code: 'unsupported_format' },
    status: 'error'
  });
});

it('rejects empty image responses without writing them into the render cache', async () => {
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(new Response(new Uint8Array([]), { headers: { 'content-type': 'image/jpeg' }, status: 200 }))
    .mockResolvedValueOnce(new Response(JPEG_BYTES, { headers: { 'content-type': 'image/jpeg' }, status: 200 }));
  vi.stubGlobal('fetch', fetchMock);

  await expect(fetchRemoteImageResource('https://example.com/images/cover.jpg')).resolves.toMatchObject({ status: 'error' });
  resetRemoteImagePipelineForTests();
  configureRemoteImagePipelineCacheRoot(tempRoot);

  await expect(fetchRemoteImageResource('https://example.com/images/cover.jpg')).resolves.toMatchObject({
    resource: { bytes: JPEG_BYTES },
    status: 'ready'
  });
});

it('retries with the source origin after a direct anti-hotlink response', async () => {
  const fetchTransport = vi.fn()
    .mockResolvedValueOnce(new Response(new TextEncoder().encode('<html></html>'), { headers: { 'content-type': 'text/html' }, status: 200 }))
    .mockResolvedValueOnce(new Response(JPEG_BYTES, { headers: { 'content-type': 'image/jpeg' }, status: 200 }));
  configureRemoteImageFetchTransportForTests(fetchTransport);

  await expect(fetchRemoteImageResource('https://cdn.example/images/cover.jpg', { sourceOrigin: 'https://source.example/' }))
    .resolves.toMatchObject({
      resource: { bytes: JPEG_BYTES, mimeType: 'image/jpeg' },
      status: 'ready'
    });

  expect(fetchTransport).toHaveBeenCalledTimes(2);
  expect(fetchTransport.mock.calls[0]?.[1]?.headers).not.toHaveProperty('Referer');
  expect(fetchTransport.mock.calls[1]?.[1]?.headers).toEqual(expect.objectContaining({
    Referer: 'https://source.example/',
    'Sec-Fetch-Dest': 'image',
    'Sec-Fetch-Site': 'cross-site'
  }));
  expect(learnRemoteImageSourceOrigin).toHaveBeenCalledWith(
    'https://cdn.example/images/cover.jpg',
    'https://source.example/'
  );
});

it('does not learn a source rule when the direct request succeeds', async () => {
  const fetchTransport = vi.fn().mockResolvedValue(
    new Response(PNG_BYTES, { headers: { 'content-type': 'image/png' }, status: 200 })
  );
  configureRemoteImageFetchTransportForTests(fetchTransport);

  await expect(fetchRemoteImageResource('https://cdn.example/images/cover.png', { sourceOrigin: 'https://source.example/' }))
    .resolves.toMatchObject({ status: 'ready' });

  expect(fetchTransport).toHaveBeenCalledTimes(1);
  expect(learnRemoteImageSourceOrigin).not.toHaveBeenCalled();
});

it('keeps in-flight source-origin retries separate from direct fetches', async () => {
  let releaseDirect!: () => void;
  const directGate = new Promise<void>((resolve) => {
    releaseDirect = resolve;
  });
  const fetchTransport = vi.fn(async (_sourceUrl: string, init: RequestInit) => {
    if (!(init.headers as Record<string, string>).Referer) await directGate;
    return new Response(PNG_BYTES, { headers: { 'content-type': 'image/png' }, status: 200 });
  });
  configureRemoteImageFetchTransportForTests(fetchTransport);

  const direct = fetchRemoteImageResource('https://cdn.example/images/cover.png');
  const sourced = fetchRemoteImageResource('https://cdn.example/images/cover.png', { sourceOrigin: 'https://source.example/' });
  releaseDirect?.();
  await Promise.all([direct, sourced]);

  expect(fetchTransport).toHaveBeenCalledTimes(2);
});
