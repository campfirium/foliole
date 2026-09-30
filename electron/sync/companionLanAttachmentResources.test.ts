import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const attachmentMock = vi.hoisted(() => ({
  loadAttachmentResourceStorageIdentity: vi.fn(),
  resolveAttachmentFileForSync: vi.fn()
}));

vi.mock('../attachments/resourceResolver.js', () => ({
  resolveAttachmentFileForSync: attachmentMock.resolveAttachmentFileForSync
}));
vi.mock('../database/attachmentResourceDescription.js', () => ({
  loadAttachmentResourceStorageIdentity: attachmentMock.loadAttachmentResourceStorageIdentity
}));

import { ATTACHMENT_RANGE_BYTES, loadCompanionAttachmentResource } from './companionLanAttachmentResources.js';

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
  attachmentMock.loadAttachmentResourceStorageIdentity.mockReturnValue({ contentHash });
  attachmentMock.resolveAttachmentFileForSync.mockReturnValue({ filePath,
    mimeType: 'application/octet-stream', sizeBytes: body.byteLength, status: 'ready' });

  await expect(loadCompanionAttachmentResource('att-1', contentHash)).resolves.toEqual({
    contentLength: body.byteLength,
    filePath,
    mimeType: 'application/octet-stream',
    status: 'ready'
  });
});

it('does not serve bytes for mismatched requested content hashes', async () => {
  attachmentMock.loadAttachmentResourceStorageIdentity.mockReturnValue({ contentHash: 'hash-current' });

  await expect(loadCompanionAttachmentResource('att-1', 'hash-old')).resolves.toEqual({
    error: 'content_hash_mismatch',
    status: 'error',
    statusCode: 409
  });
  expect(attachmentMock.resolveAttachmentFileForSync).not.toHaveBeenCalled();
});

it('serves only a bounded authenticated attachment range', async () => {
  const filePath = path.join(tempRoot, 'large.bin');
  await fs.writeFile(filePath, Buffer.alloc(ATTACHMENT_RANGE_BYTES + 7));
  attachmentMock.loadAttachmentResourceStorageIdentity.mockReturnValue({ contentHash: 'hash-current' });
  attachmentMock.resolveAttachmentFileForSync.mockReturnValue({ filePath,
    mimeType: 'application/pdf', sizeBytes: ATTACHMENT_RANGE_BYTES + 7, status: 'ready' });

  await expect(loadCompanionAttachmentResource('att-1', 'hash-current',
    { offset: String(ATTACHMENT_RANGE_BYTES), length: '7' })).resolves.toEqual({
    byteOffset: ATTACHMENT_RANGE_BYTES, contentLength: 7,
    totalBytes: ATTACHMENT_RANGE_BYTES + 7, filePath,
    mimeType: 'application/pdf', status: 'ready'
  });
  await expect(loadCompanionAttachmentResource('att-1', 'hash-current',
    { offset: '0', length: String(ATTACHMENT_RANGE_BYTES + 1) })).resolves.toMatchObject({
    error: 'invalid_request', statusCode: 400
  });
});

it('serves an empty attachment as one authenticated empty range', async () => {
  const filePath = path.join(tempRoot, 'empty.bin');
  await fs.writeFile(filePath, '');
  attachmentMock.loadAttachmentResourceStorageIdentity.mockReturnValue({ contentHash: 'hash-empty' });
  attachmentMock.resolveAttachmentFileForSync.mockReturnValue({ filePath,
    mimeType: null, sizeBytes: 0, status: 'ready' });

  await expect(loadCompanionAttachmentResource('att-1', 'hash-empty',
    { offset: '0', length: String(ATTACHMENT_RANGE_BYTES) })).resolves.toEqual({
    byteOffset: 0, contentLength: 0, totalBytes: 0, filePath, mimeType: null, status: 'ready'
  });
});
