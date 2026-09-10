// @vitest-environment node

import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import type { AttachmentResourceDescription } from '../../lib/platform/attachmentResource.js';
import { buildCanonicalAttachmentStorageKey } from '../../lib/platform/attachmentResource.js';

import { buildAttachmentAssetUrl } from './attachmentAssetUrl.js';
import { resolveAttachmentFile, resolveAttachmentResource } from './resourceResolver.js';
import { resolveAttachmentStorageKeyPath } from './storagePath.js';

let tempRoot = '';

beforeEach(async () => { tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-resource-')); });
afterEach(async () => { vi.restoreAllMocks(); await fs.rm(tempRoot, { recursive: true, force: true }); });

function description(bytes: Buffer): AttachmentResourceDescription {
  const contentHash = createHash('sha256').update(bytes).digest('hex');
  return {
    attachmentId: 'attachment-not-equal-to-hash', availability: 'local', contentHash,
    libraryScope: 'library-1', mimeType: 'image/png',
    storageKey: buildCanonicalAttachmentStorageKey(contentHash, 'image/png')!
  };
}

it('reads only the canonical file named by a self-contained description', async () => {
  const bytes = Buffer.from('image-bytes');
  const resource = description(bytes);
  const filePath = resolveAttachmentStorageKeyPath(tempRoot, resource.storageKey);
  await fs.writeFile(filePath, bytes);
  expect(resolveAttachmentResource(resource, tempRoot)).toEqual({
    status: 'ready', mime_type: 'image/png', resource_url: buildAttachmentAssetUrl(resource)
  });
});

it('rejects a hash mismatch and does not open a bare-name fallback', async () => {
  const bytes = Buffer.from('expected');
  const resource = description(bytes);
  await fs.writeFile(path.join(tempRoot, resource.contentHash), bytes);
  expect(resolveAttachmentFile(resource, tempRoot)).toEqual({ status: 'missing_file', mimeType: 'image/png' });
  await fs.writeFile(resolveAttachmentStorageKeyPath(tempRoot, resource.storageKey), Buffer.from('wrong'));
  expect(resolveAttachmentFile(resource, tempRoot)).toEqual({ status: 'missing_file', mimeType: 'image/png' });
});

it('rejects non-canonical or mismatched descriptions before touching bytes', () => {
  const resource = description(Buffer.from('bytes'));
  expect(resolveAttachmentFile({ ...resource, storageKey: resource.contentHash }, tempRoot)).toEqual({ status: 'not_found' });
  expect(resolveAttachmentFile({ ...resource, contentHash: 'f'.repeat(64) }, tempRoot)).toEqual({ status: 'not_found' });
});
