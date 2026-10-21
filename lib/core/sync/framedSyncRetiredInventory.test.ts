import { sha256 } from '@noble/hashes/sha2.js';
import { expect, it, vi } from 'vitest';

import type { DbPort } from './dbPort.js';
import { resolveFramedSyncDifferenceRequest } from './framedSyncDifferenceRequest.js';
import { compareFramedSyncInventories } from './framedSyncInventory.js';
import { readFramedSyncInventoryEntry } from './framedSyncInventoryRead.js';

type Version = [string, string, string, string, string | null,
  'available' | 'deleted' | 'missing', string | null];
const version = (hash: string | null): Version =>
  ['old', 'identity', 'author', '2026-10-15T00:00:00Z', hash, 'deleted', null];

async function inventory(value: Version) {
  const row = {
    content_hash: JSON.stringify(['node', 'current', [value]]), object_id: 'node',
    frontier_json: '["current"]', relations_json: '[]', resources_json: '[]',
    reviews_json: '[]', states_json: '[]',
    version_body_hashes_json: JSON.stringify({ old: value[4] })
  };
  const port: DbPort = {
    query: vi.fn().mockResolvedValue([row]),
    run: async () => { throw new Error('inventory_must_not_write'); },
    transaction: async <T>(task: (tx: DbPort) => Promise<T>) => task(port)
  };
  const before = JSON.stringify(row);
  const result = await readFramedSyncInventoryEntry(port, { globalId: 'node', objectType: 'node' });
  expect(JSON.stringify(row)).toBe(before);
  return result!;
}

it.each([null, 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', 'a'.repeat(64)])(
  'compares retired payloads equally without rewriting their stored hashes (%s)', async hash => {
    const local = await inventory(version(hash));
    const remote = await inventory(version('b'.repeat(64)));
    expect(local.versionStates).toEqual(remote.versionStates);
    expect(compareFramedSyncInventories({ local: [local], remote: [remote] })).toEqual([]);
  }
);

it.each([0, 1, 2, 3, 6] as const)('keeps history field %s out of the comparison hash', async field => {
  const changed = version('b'.repeat(64));
  changed[field] = 'different';
  const local = await inventory(version('a'.repeat(64)));
  const remote = await inventory(changed);
  expect(local.sharedStateHash).toEqual(remote.sharedStateHash);
  expect(local.versionStates).not.toEqual(remote.versionStates);
});

it.each(['available', 'missing'] as const)('keeps the %s history body state out of the comparison hash', async state => {
  const active = version('a'.repeat(64));
  active[5] = state;
  const local = await inventory(active);
  const retired = await inventory(version(active[4]));
  expect(local.sharedStateHash).toEqual(retired.sharedStateHash);
  expect(local.unready).toBe(state === 'missing');
});

it('compares the current version in the comparison hash', async () => {
  const local = await inventory(version('a'.repeat(64)));
  const row = { content_hash: JSON.stringify(['node', 'other-current', [version('a'.repeat(64))]]), object_id: 'node',
    frontier_json: '["other-current"]', relations_json: '[]', resources_json: '[]', reviews_json: '[]', states_json: '[]',
    version_body_hashes_json: JSON.stringify({ old: 'a'.repeat(64) }) };
  const port: DbPort = { query: vi.fn().mockResolvedValue([row]),
    run: async () => { throw new Error('inventory_must_not_write'); },
    transaction: async <T>(task: (tx: DbPort) => Promise<T>) => task(port) };
  const moved = await readFramedSyncInventoryEntry(port, { globalId: 'node', objectType: 'node' });
  expect(moved!.sharedStateHash).not.toEqual(local.sharedStateHash);
});

it('resolves requested immutable fact IDs independently of a previous inventory hash', async () => {
  const historical = version('a'.repeat(64));
  const current = await inventory(historical);
  const oldHash = sha256(new TextEncoder().encode(JSON.stringify([
    ['node', 'current', [historical]], [], [], []
  ])));
  const request: Parameters<typeof resolveFramedSyncDifferenceRequest>[1] = {
    globalId: current.globalId, objectType: 'node', currentVersionId: current.currentVersionId ?? '',
    blobHashes: [], resources: [], roundId: new Uint8Array(16),
    facts: [{ factId: 'current', globalId: 'node', kind: 2 as const, objectType: 'node' }],
    sourceStateHash: oldHash };
  expect(() => resolveFramedSyncDifferenceRequest(current, request))
    .not.toThrow();
  expect(() => resolveFramedSyncDifferenceRequest(current,
    { ...request, sourceStateHash: new Uint8Array(current.sharedStateHash) })).not.toThrow();
});
