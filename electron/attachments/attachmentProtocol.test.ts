// @vitest-environment node

import { pathToFileURL } from 'node:url';

import { beforeEach, expect, it, vi } from 'vitest';

const { handle, registerSchemesAsPrivileged } = vi.hoisted(() => ({
  handle: vi.fn(),
  registerSchemesAsPrivileged: vi.fn()
}));

const { fetch } = vi.hoisted(() => ({
  fetch: vi.fn()
}));

const { resolveAttachmentFile } = vi.hoisted(() => ({
  resolveAttachmentFile: vi.fn()
}));

vi.mock('electron', () => ({
  net: {
    fetch
  },
  protocol: {
    handle,
    registerSchemesAsPrivileged
  }
}));

vi.mock('./resourceResolver.js', () => ({
  resolveAttachmentFile
}));

import { buildAttachmentAssetUrl } from './attachmentAssetUrl.js';
import {
  ATTACHMENT_PROTOCOL_SCHEME,
  registerAttachmentProtocol,
  registerAttachmentProtocolScheme
} from './attachmentProtocol.js';

beforeEach(() => {
  vi.clearAllMocks();
});

it('registers the attachment scheme with secure standard privileges', () => {
  registerAttachmentProtocolScheme();

  expect(registerSchemesAsPrivileged).toHaveBeenCalledWith([
    {
      scheme: ATTACHMENT_PROTOCOL_SCHEME,
      privileges: {
        corsEnabled: true,
        secure: true,
        standard: true,
        supportFetchAPI: true
      }
    }
  ]);
});

it('serves attachment resources with mime and cache headers but no page CSP', async () => {
  fetch.mockResolvedValue(new Response(Buffer.from('image-bytes'), { status: 200 }));
  const filePath = '/tmp/attachment-hash';
  resolveAttachmentFile.mockReturnValue({
    status: 'ready',
    filePath,
    mimeType: 'image/png'
  });

  registerAttachmentProtocol();
  const handler = handle.mock.calls[0]?.[1];
  expect(typeof handler).toBe('function');

  const response = await handler({ url: buildAttachmentAssetUrl('hash-1') });

  expect(resolveAttachmentFile).toHaveBeenCalledWith('hash-1');
  expect(fetch).toHaveBeenCalledWith(pathToFileURL(filePath).toString());
  expect(response.status).toBe(200);
  expect(response.headers.get('content-type')).toBe('image/png');
  expect(response.headers.get('content-security-policy')).toBeNull();
  expect(response.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
  await expect(response.arrayBuffer()).resolves.toMatchObject(Buffer.from('image-bytes').buffer);
});

it('normalizes file fetch status zero so attachment images can load through the protocol', async () => {
  fetch.mockResolvedValue({
    body: new Response(Buffer.from('image-bytes')).body,
    status: 0
  });
  resolveAttachmentFile.mockReturnValue({
    status: 'ready',
    filePath: '/tmp/attachment-hash',
    mimeType: 'image/png'
  });

  registerAttachmentProtocol();
  const handler = handle.mock.calls[0]?.[1];
  const response = await handler({ url: buildAttachmentAssetUrl('hash-1') });

  expect(response.status).toBe(200);
  expect(response.headers.get('content-type')).toBe('image/png');
  await expect(response.arrayBuffer()).resolves.toMatchObject(Buffer.from('image-bytes').buffer);
});

it('returns not found when the attachment file cannot be resolved', async () => {
  resolveAttachmentFile.mockReturnValue({ status: 'missing_file', mimeType: 'image/png' });

  registerAttachmentProtocol();
  const handler = handle.mock.calls[0]?.[1];
  const response = await handler({ url: buildAttachmentAssetUrl('hash-1') });

  expect(response.status).toBe(404);
});
