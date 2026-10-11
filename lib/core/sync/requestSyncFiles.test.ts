import { sha256 } from '@noble/hashes/sha2.js';
import { expect, it } from 'vitest';

import { RequestSyncFiles, REQUEST_SYNC_MEMORY_BYTES, type RequestSyncFilePort } from './requestSyncFiles.js';

function storage() {
  const disk = new Map<string, Uint8Array>();
  const port: RequestSyncFilePort = {
    read: async key => disk.get(key) ?? null,
    write: async (key, bytes) => { disk.set(key, bytes.slice()); },
    remove: async directory => { for (const key of disk.keys()) if (key.startsWith(directory + '/')) disk.delete(key); }
  };
  return { disk, port };
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
