// @vitest-environment node

import { createHash, webcrypto } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { buildCanonicalAttachmentStorageKey } from '../../lib/platform/attachmentResource.js';
import { clearAttachmentLibraryPathSnapshot, publishAttachmentLibraryPathSnapshot } from '../attachments/attachmentLibraryPathSnapshot.js';
import { resolveAttachmentStorageKeyPath } from '../attachments/storagePath.js';

vi.mock('./connection.js', () => ({ resolveDatabasePath: () => '/library/foliole.db' }));

import { loadAttachmentResourceDescription } from './attachmentResourceDescription.js';

const PDF = Buffer.from('%PDF-1.7\nbody');
let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-resource-description-'));
  publishAttachmentLibraryPathSnapshot({ assetsDir: tempRoot, libraryScope: 'library-1' });
});
afterEach(async () => {
  vi.restoreAllMocks();
  clearAttachmentLibraryPathSnapshot();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

function keyFor(bytes: Buffer) {
  return buildCanonicalAttachmentStorageKey(createHash('sha256').update(bytes).digest('hex'), 'application/pdf')!;
}

it('reports a stored file as local without hashing or reading it whole', async () => {
  const storageKey = keyFor(PDF);
  await fs.writeFile(resolveAttachmentStorageKeyPath(tempRoot, storageKey), PDF);
  const digest = vi.spyOn(webcrypto.subtle, 'digest');
  const readFile = vi.spyOn(fs, 'readFile');

  expect(await loadAttachmentResourceDescription(storageKey)).toEqual(expect.objectContaining({
    availability: 'local', mimeType: 'application/pdf', storageKey
  }));
  expect(digest).not.toHaveBeenCalled();
  expect(readFile).not.toHaveBeenCalled();
});

it('reports missing when no regular file of the expected type is stored', async () => {
  const storageKey = keyFor(PDF);
  expect(await loadAttachmentResourceDescription(storageKey)).toEqual(expect.objectContaining({ availability: 'missing' }));
  await fs.writeFile(resolveAttachmentStorageKeyPath(tempRoot, storageKey), Buffer.from('plain text'));
  expect(await loadAttachmentResourceDescription(storageKey)).toEqual(expect.objectContaining({ availability: 'missing' }));
});
