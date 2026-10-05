import { bytesToHex } from '@noble/hashes/utils.js';
import { expect, it, vi } from 'vitest';

import type { DbPort, DbRow } from './dbPort.js';
import { readFramedSyncInventoryEntry } from './framedSyncInventoryRead.js';

function port(bodyText: string | null) {
  const db = {
    query: vi.fn(async (sql: string): Promise<DbRow[]> => {
      if (sql.includes('SELECT node.id')) return [{
        body_text: bodyText, content_hash: '4'.repeat(64), current_version_id: 'version-1', id: 'node-1'
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

it('does not advertise a retired body as an available empty blob', async () => {
  await expect(readFramedSyncInventoryEntry(port(null), {
    globalId: 'node-1', objectType: 'node'
  })).rejects.toThrow('framed_sync_inventory_body_unavailable');
});
