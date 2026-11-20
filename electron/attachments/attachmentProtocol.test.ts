// @vitest-environment node

import { createHash, webcrypto } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { buildCanonicalAttachmentStorageKey } from '../../lib/platform/attachmentResource.js';

const { handle } = vi.hoisted(() => ({ handle: vi.fn() }));
vi.mock('electron', () => ({ protocol: { handle } }));

import { buildAttachmentAssetUrl } from './attachmentAssetUrl.js';
import { clearAttachmentLibraryPathSnapshot, publishAttachmentLibraryPathSnapshot } from './attachmentLibraryPathSnapshot.js';
import { registerAttachmentProtocol } from './attachmentProtocol.js';
import { resolveAttachmentResource } from './resourceResolver.js';
import { resolveAttachmentStorageKeyPath } from './storagePath.js';

const PNG_PREFIX = Buffer.from('89504e470d0a1a0a', 'hex');
let tempRoot = '';

beforeEach(async () => {
  vi.clearAllMocks();
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-asset-protocol-'));
  publishAttachmentLibraryPathSnapshot({ assetsDir: tempRoot, libraryScope: 'library-1' });
});
afterEach(async () => {
  vi.restoreAllMocks();
  clearAttachmentLibraryPathSnapshot();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

async function storeImage(bytes: Buffer, stored = bytes) {
  const contentHash = createHash('sha256').update(bytes).digest('hex');
  const storageKey = buildCanonicalAttachmentStorageKey(contentHash, 'image/png')!;
  await fs.writeFile(resolveAttachmentStorageKeyPath(tempRoot, storageKey), stored);
  return { attachmentId: contentHash, availability: 'local' as const, contentHash,
    libraryScope: 'library-1', mimeType: 'image/png' as const, storageKey };
}

async function request(url: string, range?: string) {
  registerAttachmentProtocol();
  const handler = handle.mock.calls[0]?.[1];
  const headers = new Headers();
  if (range) headers.set('range', range);
  return handler({ headers, url }) as Promise<Response>;
}

it('serves a stored image with mime and cache headers without hashing or reading it whole', async () => {
  const bytes = Buffer.concat([PNG_PREFIX, Buffer.from('image-bytes')]);
  const resource = await storeImage(bytes);
  const digest = vi.spyOn(webcrypto.subtle, 'digest');
  const readFile = vi.spyOn(fs, 'readFile');

  const response = await request(buildAttachmentAssetUrl(resource));

  expect(response.status).toBe(200);
  expect(response.headers.get('access-control-allow-origin')).toBe('*');
  expect(response.headers.get('content-type')).toBe('image/png');
  expect(response.headers.get('content-security-policy')).toBeNull();
  expect(response.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
  expect(response.headers.get('content-length')).toBe(String(bytes.length));
  expect(Buffer.from(await response.arrayBuffer())).toEqual(bytes);
  expect(digest).not.toHaveBeenCalled();
  expect(readFile).not.toHaveBeenCalled();
});

it('serves only the requested byte range', async () => {
  const bytes = Buffer.concat([PNG_PREFIX, Buffer.from('0123456789')]);
  const resource = await storeImage(bytes);
  const digest = vi.spyOn(webcrypto.subtle, 'digest');

  const response = await request(buildAttachmentAssetUrl(resource), 'bytes=10-13');

  expect(response.status).toBe(206);
  expect(response.headers.get('accept-ranges')).toBe('bytes');
  expect(response.headers.get('content-range')).toBe(`bytes 10-13/${bytes.length}`);
  expect(response.headers.get('content-length')).toBe('4');
  await expect(response.text()).resolves.toBe('2345');
  expect(digest).not.toHaveBeenCalled();
});

it('leaves damaged bytes to the resolve command, which still reports them missing for repair', async () => {
  const expected = Buffer.concat([PNG_PREFIX, Buffer.from('expected')]);
  const damaged = Buffer.concat([PNG_PREFIX, Buffer.from('damaged!')]);
  const resource = await storeImage(expected, damaged);

  expect((await request(buildAttachmentAssetUrl(resource))).status).toBe(200);
  expect(await resolveAttachmentResource(resource.storageKey, tempRoot)).toEqual({
    status: 'missing_file', mime_type: 'image/png', resource_url: null
  });
});

it('returns not found for a missing file or bytes of another type', async () => {
  const missing = await storeImage(Buffer.concat([PNG_PREFIX, Buffer.from('gone')]));
  await fs.rm(resolveAttachmentStorageKeyPath(tempRoot, missing.storageKey));
  expect((await request(buildAttachmentAssetUrl(missing))).status).toBe(404);

  const wrongType = await storeImage(Buffer.from('not an image at all'));
  expect((await request(buildAttachmentAssetUrl(wrongType))).status).toBe(404);
});

it('returns not found for a symbolic link at the canonical path', async () => {
  const bytes = Buffer.concat([PNG_PREFIX, Buffer.from('linked')]);
  const resource = await storeImage(bytes);
  const canonical = resolveAttachmentStorageKeyPath(tempRoot, resource.storageKey);
  const elsewhere = path.join(tempRoot, 'elsewhere.png');
  await fs.rename(canonical, elsewhere);
  await fs.symlink(elsewhere, canonical);
  expect((await request(buildAttachmentAssetUrl(resource))).status).toBe(404);
});

it('ignores unknown query fields without changing the resource identity', async () => {
  const resource = await storeImage(Buffer.concat([PNG_PREFIX, Buffer.from('bytes')]));
  const response = await request(`${buildAttachmentAssetUrl(resource)}?retry=1&future=value`);
  expect(response.status).toBe(200);
});

it('fails closed for non-canonical paths', async () => {
  const resource = await storeImage(Buffer.concat([PNG_PREFIX, Buffer.from('bytes')]));
  const response = await request(`foliole-asset://attachment/../${resource.storageKey}`);
  expect(response.status).toBe(400);
});
