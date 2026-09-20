import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ resource: vi.fn(), queryOne: vi.fn() }));
vi.mock('./companionLanAttachmentResources.js', () => ({ loadCompanionAttachmentResource: mocks.resource }));
vi.mock('../database/connection.js', () => ({ openDatabaseConnection: () => ({ driver: { queryOne: mocks.queryOne } }) }));
vi.mock('../database/syncGroupStore.js', () => ({ loadDesktopSyncGroup: () => ({ local_device_identity_key: 'stable-C' }) }));

import { loadResourceAvailability } from './resourceAvailability.js';

const bytes = Buffer.from('verified bytes');
const hash = createHash('sha256').update(bytes).digest('hex');
let root: string;
beforeEach(async () => {
  vi.clearAllMocks();
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-resource-presence-'));
});
afterEach(async () => fs.rm(root, { recursive: true, force: true }));

it('binds claims to stable identity and verifies real file bytes rather than metadata', async () => {
  const filePath = path.join(root, 'resource');
  await fs.writeFile(filePath, bytes);
  mocks.resource.mockResolvedValue({ status: 'ready', filePath, contentLength: bytes.length });
  const body = JSON.stringify({ resources: [{ kind: 'attachment', id: hash }] });
  expect(await loadResourceAvailability(body)).toEqual({ provider_device_id: 'stable-C', resources: [
    { kind: 'attachment', id: hash, status: 'available', sha256: hash, size_bytes: bytes.length }
  ] });
  await fs.writeFile(filePath, 'corrupt bytes');
  expect((await loadResourceAvailability(body)).resources[0]?.status).toBe('checksum_mismatch');
  await fs.rm(filePath);
  expect((await loadResourceAvailability(body)).resources[0]?.status).toBe('missing');
});

it('reports a historical metadata row without bytes as missing regardless of source host', async () => {
  mocks.resource.mockResolvedValue({ status: 'error', error: 'missing_file', statusCode: 404 });
  const body = JSON.stringify({ resources: [{ kind: 'attachment', id: hash }] });
  expect((await loadResourceAvailability(body)).resources).toEqual([{ kind: 'attachment', id: hash, status: 'missing' }]);
});

it('checks stored blob hash and size, including corrupt and absent data', async () => {
  const body = JSON.stringify({ resources: [{ kind: 'content_blob', id: 'b'.repeat(64) }] });
  mocks.queryOne.mockReturnValue({ data: bytes, stored_sha256: hash, stored_size_bytes: bytes.length });
  expect((await loadResourceAvailability(body)).resources[0]).toMatchObject({ status: 'available', sha256: hash });
  mocks.queryOne.mockReturnValue({ data: bytes, stored_sha256: hash, stored_size_bytes: 0 });
  expect((await loadResourceAvailability(body)).resources[0]?.status).toBe('checksum_mismatch');
  mocks.queryOne.mockReturnValue(null);
  expect((await loadResourceAvailability(body)).resources[0]?.status).toBe('missing');
});

it('rejects malformed and oversized batches before accessing a resource', async () => {
  await expect(loadResourceAvailability('{')).rejects.toThrow();
  await expect(loadResourceAvailability(JSON.stringify({ resources: Array(33).fill({ kind: 'attachment', id: hash }) }))).rejects.toThrow();
  expect(mocks.resource).not.toHaveBeenCalled();
  expect(mocks.queryOne).not.toHaveBeenCalled();
});
