// @vitest-environment node

import { beforeEach, expect, it, vi } from 'vitest';

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

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

it('downloads a remote image and forwards it into CAS storage', async () => {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(new Uint8Array([1, 2, 3]), {
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

it('falls back to url extension when the response omits image content-type', async () => {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(new Uint8Array([1, 2, 3]), {
      headers: { 'content-type': 'application/octet-stream' },
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
