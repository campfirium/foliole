import { sha256 } from '@noble/hashes/sha2.js';
import { expect, it } from 'vitest';

import { RequestSyncFiles, REQUEST_SYNC_MEMORY_BYTES, type RequestSyncFilePort } from './requestSyncFiles.js';

function storage() {
  const disk = new Map<string, Uint8Array>();
  const reads: string[] = [];
  const port: RequestSyncFilePort = {
    read: async key => { reads.push(key); return disk.get(key) ?? null; },
    write: async (key, bytes) => { disk.set(key, bytes.slice()); },
    remove: async directory => { for (const key of disk.keys()) if (key.startsWith(directory + '/')) disk.delete(key); }
  };
  return { disk, port, reads };
}

it('keeps small bodies in owned memory and spills only bytes beyond the request budget', async () => {
  const { disk, port } = storage();
  const request = new RequestSyncFiles(port, 'requests/test');
  const bodies = Array.from({ length: REQUEST_SYNC_MEMORY_BYTES / (512 * 1024) + 2 }, (_, index) => {
    const bytes = new Uint8Array(512 * 1024).fill(index);
    return { bytes, blob: { byteLength: BigInt(bytes.length), role: 1, required: true, sha256: sha256(bytes) } };
  });
  for (const { bytes, blob } of bodies) await request.writeBody(blob, bytes);
  expect([...disk.values()].reduce((sum, bytes) => sum + bytes.length, 0)).toBe(1024 * 1024);
  for (const { bytes, blob } of bodies) expect(sha256(await request.loadBody(blob))).toEqual(sha256(bytes));
  bodies[0]!.bytes.fill(255);
  expect((await request.loadBody(bodies[0]!.blob))[0]).toBe(0);
  await request.close();
  expect(disk.size).toBe(0);
  await expect(request.loadBody(bodies[0]!.blob)).rejects.toThrow('request_sync_files_closed');
});

it('does not write small facts to scratch storage', async () => {
  const { disk, port } = storage();
  const request = new RequestSyncFiles(port, 'requests/test');
  const fact = { factId: 'v1', globalId: 'node', objectType: 'node', kind: 2,
    sharedStateHash: new Uint8Array(32), body: [], blobs: [] };
  await request.writeFact(fact);
  const result = [];
  for await (const value of request.readFacts()) result.push(value);
  expect(result).toEqual([fact]);
  expect(disk.size).toBe(0);
  await request.close();
});

it('completes an in-memory request when scratch storage is unavailable', async () => {
  const unavailable = async () => { throw new Error('scratch_storage_unavailable'); };
  const request = new RequestSyncFiles({ read: unavailable, write: unavailable, remove: unavailable }, 'requests/memory');
  const fact = { factId: 'v1', globalId: 'node', objectType: 'node', kind: 2,
    sharedStateHash: new Uint8Array(32), body: [], blobs: [] };
  await request.writeFact(fact);
  const facts = [];
  for await (const value of request.readFacts()) facts.push(value);
  expect(facts).toEqual([fact]);
  await expect(request.close()).resolves.toBeUndefined();
});

it('cleans partially written spill files after the storage write rejects', async () => {
  const stored = storage();
  const request = new RequestSyncFiles({ ...stored.port, async write(key, bytes) {
    await stored.port.write(key, bytes.subarray(0, 1));
    throw new Error('scratch_write_failed');
  } }, 'requests/partial');
  for (let index = 0; index < REQUEST_SYNC_MEMORY_BYTES / (1024 * 1024); index++) {
    const bytes = new Uint8Array(1024 * 1024).fill(index);
    await request.writeBody({ byteLength: BigInt(bytes.length), role: 1, required: true, sha256: sha256(bytes) }, bytes);
  }
  const bytes = new Uint8Array(512 * 1024).fill(255);
  await expect(request.writeBody({ byteLength: BigInt(bytes.length), role: 1, required: true, sha256: sha256(bytes) }, bytes))
    .rejects.toThrow('scratch_write_failed');
  expect(stored.disk.size).toBe(1);
  await request.close();
  expect(stored.disk.size).toBe(0);
});


async function spilledFacts() {
  const stored = storage();
  const request = new RequestSyncFiles(stored.port, 'requests/lazy');
  for (let index = 0; index < REQUEST_SYNC_MEMORY_BYTES / (1024 * 1024); index++) {
    const filler = new Uint8Array(1024 * 1024).fill(index);
    await request.writeBody({ byteLength: BigInt(filler.length), role: 1, required: true, sha256: sha256(filler) }, filler);
  }
  const body = new Uint8Array(1024 * 1024).fill(8);
  const blob = { byteLength: BigInt(body.length), role: 1, required: true, sha256: sha256(body) };
  await request.writeBody(blob, body);
  const first = { factId: 'v1', globalId: 'node', objectType: 'node', kind: 2,
    sharedStateHash: new Uint8Array(32), body: [], blobs: [blob] };
  const second = { ...first, factId: 'v2' };
  await request.writeFact(first); await request.writeFact(second);
  return { ...stored, request, first, second, body, blob };
}

it('stops after one fact without reading the next oversized malformed frame or any body', async () => {
  const fixture = await spilledFacts();
  try {
    const factKeys = [...fixture.disk.keys()].filter(key => key.includes('/fact-'));
    expect(factKeys).toHaveLength(2);
    fixture.disk.set(factKeys[1]!, new Uint8Array(3 * 1024 * 1024).fill(255));
    const received = [];
    for await (const fact of fixture.request.readFacts()) { received.push(fact); break; }
    expect(received).toEqual([fixture.first]);
    expect(fixture.reads).toEqual([factKeys[0]]);
    const resumed = fixture.request.readFacts()[Symbol.asyncIterator]();
    expect((await resumed.next()).value).toEqual(fixture.first);
    await expect(resumed.next()).rejects.toThrow();
    expect(fixture.reads).toEqual([factKeys[0], factKeys[0], factKeys[1]]);
  } finally { await fixture.request.close(); }
});

it('reads all fact descriptors without preloading their body bytes', async () => {
  const fixture = await spilledFacts();
  try {
    const facts = [];
    for await (const fact of fixture.request.readFacts()) facts.push(fact);
    expect(facts).toEqual([fixture.first, fixture.second]);
    expect(fixture.reads).toEqual([...fixture.disk.keys()].filter(key => key.includes('/fact-')));
    expect(await fixture.request.loadBody(fixture.blob)).toEqual(fixture.body);
    expect(fixture.reads.filter(key => key.includes('/body-')))
      .toEqual([...fixture.disk.keys()].filter(key => key.includes('/body-')));
  } finally { await fixture.request.close(); }
});
