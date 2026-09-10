// @vitest-environment node

import { beforeEach, expect, it, vi } from 'vitest';

const { handle } = vi.hoisted(() => ({
  handle: vi.fn()
}));

const { resolveAttachmentFile } = vi.hoisted(() => ({
  resolveAttachmentFile: vi.fn()
}));

vi.mock('electron', () => ({
  protocol: {
    handle
  }
}));

vi.mock('./resourceResolver.js', () => ({
  resolveAttachmentFile
}));

import { buildAttachmentAssetUrl } from './attachmentAssetUrl.js';
import {
  registerAttachmentProtocol
} from './attachmentProtocol.js';

beforeEach(() => {
  vi.clearAllMocks();
});

const description = {
  attachmentId: 'attachment-1', availability: 'local' as const, contentHash: 'a'.repeat(64),
  libraryScope: 'library-1', mimeType: 'image/png' as const, storageKey: `${'a'.repeat(64)}.png`
};

it('serves attachment resources with mime and cache headers but no page CSP', async () => {
  const bytes = Buffer.from('image-bytes');
  const filePath = '/tmp/attachment-hash';
  resolveAttachmentFile.mockReturnValue({
    status: 'ready',
    bytes,
    filePath,
    mimeType: 'image/png'
  });

  registerAttachmentProtocol();
  const handler = handle.mock.calls[0]?.[1];
  expect(typeof handler).toBe('function');

  const response = await handler({ headers: new Headers(), url: buildAttachmentAssetUrl(description) });

  expect(resolveAttachmentFile).toHaveBeenCalledWith(description);
  expect(response.status).toBe(200);
  expect(response.headers.get('access-control-allow-origin')).toBe('*');
  expect(response.headers.get('content-type')).toBe('image/png');
  expect(response.headers.get('content-security-policy')).toBeNull();
  expect(response.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
  await expect(response.arrayBuffer()).resolves.toMatchObject(Buffer.from('image-bytes').buffer);
});

it('serves PDF byte ranges without re-querying attachment metadata', async () => {
  const bytes = Buffer.from('0123456789');
  resolveAttachmentFile.mockReturnValue({
    status: 'ready',
    bytes,
    filePath: '/tmp/attachment-hash',
    mimeType: 'image/png'
  });

  registerAttachmentProtocol();
  const handler = handle.mock.calls[0]?.[1];
  const response = await handler({ headers: new Headers({ range: 'bytes=2-5' }), url: buildAttachmentAssetUrl(description) });

  expect(response.status).toBe(206);
  expect(response.headers.get('accept-ranges')).toBe('bytes');
  expect(response.headers.get('content-range')).toBe('bytes 2-5/10');
  expect(response.headers.get('content-type')).toBe('image/png');
  await expect(response.text()).resolves.toBe('2345');
});

it('returns not found when the attachment file cannot be resolved', async () => {
  resolveAttachmentFile.mockReturnValue({ status: 'missing_file', mimeType: 'image/png' });

  registerAttachmentProtocol();
  const handler = handle.mock.calls[0]?.[1];
  const response = await handler({ headers: new Headers(), url: buildAttachmentAssetUrl(description) });

  expect(response.status).toBe(404);
});
