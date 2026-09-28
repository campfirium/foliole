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

  expect(resolveAttachmentFile).toHaveBeenCalledWith(description.storageKey);
  expect(response.status).toBe(200);
  expect(response.headers.get('access-control-allow-origin')).toBe('*');
  expect(response.headers.get('content-type')).toBe('image/png');
  expect(response.headers.get('content-security-policy')).toBeNull();
  expect(response.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
  expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array(bytes));
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

it.each([
  [null, '0123456789'],
  ['bytes=2-5', '2345']
])('preserves exact response bytes with a pooled buffer and range %s', async (range, expected) => {
  const backing = Buffer.from('prefix0123456789suffix');
  resolveAttachmentFile.mockReturnValue({
    status: 'ready', bytes: backing.subarray(6, 16),
    filePath: '/tmp/attachment-hash', mimeType: 'application/pdf'
  });
  registerAttachmentProtocol();
  const handler = handle.mock.calls[0]?.[1];
  const headers = new Headers();
  if (range) headers.set('range', range);
  const response = await handler({ headers, url: buildAttachmentAssetUrl(description) });
  backing.fill(0);
  expect(response.headers.get('content-length')).toBe(String(expected!.length));
  expect(await response.text()).toBe(expected);
});

it('returns not found when the attachment file cannot be resolved', async () => {
  resolveAttachmentFile.mockReturnValue({ status: 'missing_file', mimeType: 'image/png' });

  registerAttachmentProtocol();
  const handler = handle.mock.calls[0]?.[1];
  const response = await handler({ headers: new Headers(), url: buildAttachmentAssetUrl(description) });

  expect(response.status).toBe(404);
});

it('ignores unknown query fields without changing the resource identity', async () => {
  resolveAttachmentFile.mockReturnValue({
    status: 'ready', bytes: Buffer.from('bytes'), filePath: '/tmp/attachment-hash', mimeType: 'image/png'
  });
  registerAttachmentProtocol();
  const handler = handle.mock.calls[0]?.[1];
  const response = await handler({
    headers: new Headers(),
    url: `${buildAttachmentAssetUrl(description)}?retry=1&future=value`
  });
  expect(resolveAttachmentFile).toHaveBeenCalledWith(description.storageKey);
  expect(response.status).toBe(200);
});

it('fails closed for non-canonical paths', async () => {
  registerAttachmentProtocol();
  const handler = handle.mock.calls[0]?.[1];
  const response = await handler({
    headers: new Headers(),
    url: `foliole-asset://attachment/../${description.storageKey}`
  });
  expect(resolveAttachmentFile).not.toHaveBeenCalled();
  expect(response.status).toBe(400);
});
