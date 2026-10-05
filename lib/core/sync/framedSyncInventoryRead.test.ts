import { bytesToHex } from '@noble/hashes/utils.js';
import { expect, it, vi } from 'vitest';

import type { DbPort, DbRow } from './dbPort.js';
import { readFramedSyncInventoryEntry } from './framedSyncInventoryRead.js';

function port(bodyText: string | null) {
  const db = {
    query: vi.fn(async (sql: string): Promise<DbRow[]> => {
      if (sql.includes('SELECT node.id')) return [{
        body_text: bodyText, content_hash: '4'.repeat(64), current_version_id: 'version-1',
        id: 'node-1', is_tombstone: 0
      }];
      return [];
    })
  } as unknown as DbPort;
  db.transaction = async <T>(task: (tx: DbPort) => Promise<T>) => task(db);
  return db;
}

it('hashes the exact readable current body in inventory', async () => {
  const entry = await readFramedSyncInventoryEntry(port('body'), {
    globalId: 'node-1', objectType: 'node'
  });

  expect(bytesToHex(entry!.resourceHashes[0]!))
    .toBe('230d8358dc8e8890b4c58deeb62912ee2f20357ae92a5cc861b98e68fe31acb5');
});

it('keeps a deleted Node in inventory with its tombstone version and empty body dependency', async () => {
  const tombstonePort = port(null);
  tombstonePort.query = vi.fn(async (sql: string): Promise<DbRow[]> => {
    if (sql.includes('SELECT node.id')) return [{
      body_text: null, content_hash: '5'.repeat(64), current_version_id: 'tombstone-1',
      id: 'node-1', is_tombstone: 1
    }];
    return [];
  });
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
