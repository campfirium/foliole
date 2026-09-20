import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const attachmentMock = vi.hoisted(() => ({
  loadAttachmentResourceDescription: vi.fn(),
  resolveAttachmentFile: vi.fn()
}));

vi.mock('../attachments/resourceResolver.js', () => ({
  resolveAttachmentFile: attachmentMock.resolveAttachmentFile
}));
vi.mock('../database/attachmentResourceDescription.js', () => ({
  loadAttachmentResourceDescription: attachmentMock.loadAttachmentResourceDescription
}));

import { loadCompanionAttachmentResource } from './companionLanAttachmentResources.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-companion-attachment-resource-'));
  vi.clearAllMocks();
});

afterEach(async () => {
  await fs.rm(tempRoot, { force: true, recursive: true });
});

it('loads attachment bytes when the attachment identity matches the requested hash', async () => {
  const body = Buffer.from('attachment body');
  const contentHash = 'hash-current';
  const filePath = path.join(tempRoot, 'att-1.bin');
  await fs.writeFile(filePath, body);
  attachmentMock.loadAttachmentResourceDescription.mockReturnValue({ contentHash });
  attachmentMock.resolveAttachmentFile.mockReturnValue({ filePath, mimeType: 'application/octet-stream', status: 'ready' });

  await expect(loadCompanionAttachmentResource('att-1', contentHash)).resolves.toEqual({
    contentLength: body.byteLength,
    filePath,
    mimeType: 'application/octet-stream',
    status: 'ready'
  });
});

it('does not serve bytes for mismatched requested content hashes', async () => {
  attachmentMock.loadAttachmentResourceDescription.mockReturnValue({ contentHash: 'hash-current' });

  await expect(loadCompanionAttachmentResource('att-1', 'hash-old')).resolves.toEqual({
    error: 'content_hash_mismatch',
    status: 'error',
    statusCode: 409
  });
  expect(attachmentMock.resolveAttachmentFile).not.toHaveBeenCalled();
});
