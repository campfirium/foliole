// @vitest-environment node

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const {
  importImageAttachmentBytes,
  normalizeImageFileName,
  registerNodeImageSources,
  resolveImageMimeType,
  runWithDatabaseConnectionOwner
} = vi.hoisted(() => ({
  importImageAttachmentBytes: vi.fn(),
  normalizeImageFileName: vi.fn((value: string) => value || 'pasted-image.png'),
  registerNodeImageSources: vi.fn(),
  resolveImageMimeType: vi.fn(),
  runWithDatabaseConnectionOwner: vi.fn(async (execute: () => unknown) => execute())
}));

vi.mock('./importImageAttachmentBytes.js', () => ({
  importImageAttachmentBytes,
  normalizeImageFileName,
  resolveImageMimeType
}));
vi.mock('../database/connection.js', () => ({ runWithDatabaseConnectionOwner }));
vi.mock('../database/nodeImageSources.js', () => ({ registerNodeImageSources }));

import {
  configureRemoteImagePipelineCacheRoot,
  fetchRemoteImageMetadata,
  fetchRemoteImageResource,
  importRemoteImageAttachment,
  resetRemoteImagePipelineForTests
} from './remoteImagePipeline.js';

const PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52,
  0, 0, 1, 0x40, 0, 0, 0, 0xf0
]);

let tempRoot: string;

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

it('imports from the remote image cache without downloading again', async () => {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(PNG_BYTES, {
      headers: { 'content-type': 'image/png' },
      status: 200
    })
  );
  vi.stubGlobal('fetch', fetchMock);
  const imported = {
    status: 'imported',
    attachment_id: 'hash-1',
    attachment_record: 'created',
    created_at: '2026-09-20T00:00:00.000Z',
    hash: 'hash-1',
    mime_type: 'image/png',
    original_name: 'cover.png',
    size_bytes: PNG_BYTES.length,
    storage_key: 'hash-1.png',
    stored_file: 'created'
  } as const;
  importImageAttachmentBytes.mockResolvedValue(imported);

  await fetchRemoteImageResource('https://example.com/images/cover.png');
  resetRemoteImagePipelineForTests();
  configureRemoteImagePipelineCacheRoot(tempRoot);
  fetchMock.mockRejectedValue(new Error('offline'));

  await expect(fetchRemoteImageMetadata('https://example.com/images/cover.png'))
    .resolves.toEqual({ height: 240, width: 320 });
  await expect(importRemoteImageAttachment({
    nodeId: 'node-1',
    sourceUrl: 'https://example.com/images/cover.png'
  })).resolves.toEqual(imported);
  expect(importImageAttachmentBytes).toHaveBeenCalledWith(expect.objectContaining({
    bytes: PNG_BYTES
  }));
  expect(registerNodeImageSources).toHaveBeenCalledWith('node-1', {
    'hash-1.png': 'https://example.com/images/cover.png'
  });
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
