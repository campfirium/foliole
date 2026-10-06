import { bytesToHex } from '@noble/hashes/utils.js';
import { expect, it, vi } from 'vitest';

import type { DbPort, DbRow } from './dbPort.js';
import { readFramedSyncInventoryEntry } from './framedSyncInventoryRead.js';

function port(bodyText: string | null, resourceReferences = '[]', isTombstone = 0) {
  const db = {
    query: vi.fn(async (sql: string): Promise<DbRow[]> => {
      if (sql.includes('FROM framed_sync_inventory')) return [{
        content_hash: '4'.repeat(64), object_id: 'node-1',
        frontier_json: JSON.stringify([isTombstone ? 'tombstone-1' : 'version-1']),
        relations_json: '[]', reviews_json: '[]', states_json: '[]',
        resources_json: JSON.stringify([
          ...(bodyText === null && !isTombstone ? [] : [isTombstone
            ? 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
            : '230d8358dc8e8890b4c58deeb62912ee2f20357ae92a5cc861b98e68fe31acb5']),
          ...JSON.parse(resourceReferences).map((item: { storage_key: string }) => item.storage_key.slice(0, 64))
        ])
      }];
      return [];
    })
  } as unknown as DbPort;
  db.transaction = async <T>(task: (tx: DbPort) => Promise<T>) => task(db);
  return db;
}

it('reads the exact stored current body dependency hash from the durable inventory', async () => {
  const entry = await readFramedSyncInventoryEntry(port('body'), {
    globalId: 'node-1', objectType: 'node'
  });

  expect(bytesToHex(entry!.resourceHashes[0]!))
    .toBe('230d8358dc8e8890b4c58deeb62912ee2f20357ae92a5cc861b98e68fe31acb5');
});

it('declares hashes for the binary resources owned by the current Node', async () => {
  const image = '1'.repeat(64);
  const pdf = '2'.repeat(64);
  const entry = await readFramedSyncInventoryEntry(port('body', JSON.stringify([
    { original_name: 'Document.pdf', role: 'reference', storage_key: `${pdf}.pdf` },
    { original_name: 'Cover.png', role: 'image', storage_key: `${image}.png` }
  ])), { globalId: 'node-1', objectType: 'node' });

  expect(entry!.resourceHashes.map(bytesToHex).sort()).toEqual([
    '230d8358dc8e8890b4c58deeb62912ee2f20357ae92a5cc861b98e68fe31acb5',
    image,
    pdf
  ].sort());
});

it('keeps a deleted Node in inventory with its tombstone version and empty body dependency', async () => {
  const tombstonePort = port(null, '[]', 1);
  const value = await readFramedSyncInventoryEntry(tombstonePort, {
    globalId: 'node-1', objectType: 'node'
  });

  expect(value).toMatchObject({ frontierFactIds: ['tombstone-1'], globalId: 'node-1' });
  expect(bytesToHex(value!.resourceHashes[0]!)).toBe(
    'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
  );
});

it('keeps a body-missing Node discoverable without claiming unavailable blob bytes', async () => {
  await expect(readFramedSyncInventoryEntry(port(null), {
    globalId: 'node-1', objectType: 'node'
  })).resolves.toMatchObject({
    frontierFactIds: ['version-1'], globalId: 'node-1', resourceHashes: []
  });
});
