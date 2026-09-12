// @vitest-environment node

import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { buildCanonicalAttachmentStorageKey } from '../../lib/platform/attachmentResource.js';

import { buildAttachmentAssetUrl } from './attachmentAssetUrl.js';
import { clearAttachmentLibraryPathSnapshot } from './attachmentLibraryPathSnapshot.js';
import { resolveAttachmentFile, resolveAttachmentResource } from './resourceResolver.js';
import { resolveAttachmentStorageKeyPath } from './storagePath.js';

let tempRoot = '';

beforeEach(async () => { tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-resource-')); });
afterEach(async () => { vi.restoreAllMocks(); await fs.rm(tempRoot, { recursive: true, force: true }); });

const PNG_PREFIX = Buffer.from('89504e470d0a1a0a', 'hex');

function description(bytes: Buffer) {
  const contentHash = createHash('sha256').update(bytes).digest('hex');
  return {
    attachmentId: 'attachment-not-equal-to-hash', availability: 'local', contentHash,
    libraryScope: 'library-1', mimeType: 'image/png',
    storageKey: buildCanonicalAttachmentStorageKey(contentHash, 'image/png')!
  };
}

it('reads only the canonical file named by a self-contained description', async () => {
  const bytes = Buffer.concat([PNG_PREFIX, Buffer.from('image-bytes')]);
  const resource = description(bytes);
  const filePath = resolveAttachmentStorageKeyPath(tempRoot, resource.storageKey);
  await fs.writeFile(filePath, bytes);
  expect(resolveAttachmentResource(resource.storageKey, tempRoot)).toEqual({
    status: 'ready', mime_type: 'image/png', resource_url: buildAttachmentAssetUrl(resource)
  });
});

it('rejects a hash mismatch and does not open a bare-name fallback', async () => {
  const bytes = Buffer.concat([PNG_PREFIX, Buffer.from('expected')]);
  const resource = description(bytes);
  await fs.writeFile(path.join(tempRoot, resource.contentHash), bytes);
  expect(resolveAttachmentFile(resource.storageKey, tempRoot)).toEqual({ status: 'missing_file', mimeType: 'image/png' });
  await fs.writeFile(resolveAttachmentStorageKeyPath(tempRoot, resource.storageKey), Buffer.from('wrong'));
  expect(resolveAttachmentFile(resource.storageKey, tempRoot)).toEqual({ status: 'missing_file', mimeType: 'image/png' });
});

it('rejects non-canonical keys before touching bytes', () => {
  const resource = description(Buffer.concat([PNG_PREFIX, Buffer.from('bytes')]));
  expect(resolveAttachmentFile(resource.contentHash, tempRoot)).toEqual({ status: 'not_found' });
});

it('returns not found without an active library instead of throwing', () => {
  clearAttachmentLibraryPathSnapshot();
  const resource = description(Buffer.concat([PNG_PREFIX, Buffer.from('bytes')]));
  expect(resolveAttachmentFile(resource.storageKey)).toEqual({ status: 'not_found' });
});

it('rejects bytes whose signature disagrees with the canonical extension', async () => {
  const bytes = Buffer.from('ffd8ff010203', 'hex');
  const contentHash = createHash('sha256').update(bytes).digest('hex');
  const storageKey = `${contentHash}.png`;
  await fs.writeFile(resolveAttachmentStorageKeyPath(tempRoot, storageKey), bytes);
  expect(resolveAttachmentFile(storageKey, tempRoot)).toEqual({ status: 'missing_file', mimeType: 'image/png' });
});

it('rejects a symbolic link even when its target has the expected bytes', async () => {
  const bytes = Buffer.concat([PNG_PREFIX, Buffer.from('linked')]);
  const resource = description(bytes);
  const target = path.join(tempRoot, 'outside.png');
  await fs.writeFile(target, bytes);
  await fs.symlink(target, resolveAttachmentStorageKeyPath(tempRoot, resource.storageKey));
  expect(resolveAttachmentFile(resource.storageKey, tempRoot)).toEqual({ status: 'missing_file', mimeType: 'image/png' });
});
