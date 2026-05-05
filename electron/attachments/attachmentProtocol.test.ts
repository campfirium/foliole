// @vitest-environment node

import { beforeEach, expect, it, vi } from 'vitest';

const { handle, registerSchemesAsPrivileged } = vi.hoisted(() => ({
  handle: vi.fn(),
  registerSchemesAsPrivileged: vi.fn()
}));

const { readFile } = vi.hoisted(() => ({
  readFile: vi.fn()
}));

const { resolveAttachmentFile } = vi.hoisted(() => ({
  resolveAttachmentFile: vi.fn()
}));

vi.mock('electron', () => ({
  protocol: {
    handle,
    registerSchemesAsPrivileged
  }
}));

vi.mock('node:fs', () => ({
  promises: { readFile }
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
        secure: true,
        standard: true,
        supportFetchAPI: true
      }
    }
  ]);
});

it('serves attachment bytes with the stored mime type through the custom protocol', async () => {
  readFile.mockResolvedValue(Buffer.from('image-bytes'));
  resolveAttachmentFile.mockReturnValue({
    status: 'ready',
    filePath: '/tmp/attachment-hash',
    mimeType: 'image/png'
  });

  registerAttachmentProtocol();
  const handler = handle.mock.calls[0]?.[1];
  expect(typeof handler).toBe('function');

  const response = await handler({ url: buildAttachmentAssetUrl('hash-1') });

  expect(resolveAttachmentFile).toHaveBeenCalledWith('hash-1');
  expect(readFile).toHaveBeenCalledWith('/tmp/attachment-hash');
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
