import { expect, it, vi } from 'vitest';

import { applyCompanionAttachmentManifest, applyCompanionContentPack } from './companionBatchDataPlane.js';
import type { DbPort } from './dbPort.js';

it('attaches a validated content pack and copies blobs inside one shared transaction', async () => {
  const port = fakePort();
  port.query = vi.fn(async (sql: string) => {
    if (sql.includes('quick_check')) return [{ quick_check: 'ok' }];
    if (sql.includes('table_info')) return ['hash', 'size_bytes', 'data'].map((name) => ({ name }));
    if (sql.includes('COUNT(*)')) return [{ count: 0 }];
    if (sql.includes('INNER JOIN')) return [{ hash: 'a'.repeat(64) }];
    return [];
  }) as DbPort['query'];

  await expect(applyCompanionContentPack(port, {
    failedHashes: ['b'.repeat(64)], now: '2026-08-06T00:00:00.000Z', packPath: "/tmp/body's.db"
  })).resolves.toEqual({ failedHashes: ['b'.repeat(64)], syncedHashes: ['a'.repeat(64)] });

  expect(port.run).toHaveBeenNthCalledWith(1, "ATTACH DATABASE '/tmp/body''s.db' AS content_batch");
  expect(port.run).toHaveBeenLastCalledWith('DETACH DATABASE content_batch');
  expect(port.transaction).toHaveBeenCalledTimes(1);
  expect(port.run).toHaveBeenCalledWith(expect.stringContaining('SELECT pack.hash, pack.data'));
  expect(port.run).not.toHaveBeenCalledWith(expect.any(String), expect.arrayContaining([expect.any(Uint8Array)]));
});

it('detaches a corrupt content pack without writing', async () => {
  const port = fakePort();
  port.query = vi.fn(async () => [{ quick_check: 'corrupt' }]) as DbPort['query'];
  await expect(applyCompanionContentPack(port, {
    failedHashes: [], now: '2026-08-06T00:00:00.000Z', packPath: '/tmp/corrupt.db'
  })).rejects.toThrow('integrity');
  expect(port.transaction).not.toHaveBeenCalled();
  expect(port.run).toHaveBeenLastCalledWith('DETACH DATABASE content_batch');
});

it('commits attachment availability from a small manifest without attachment bytes', async () => {
  const port = fakePort();
  port.query = vi.fn(async () => [{ content_hash: 'c'.repeat(64), size_bytes: 12 }]) as DbPort['query'];
  await expect(applyCompanionAttachmentManifest(port, {
    entries: [{ attachmentId: 'att-1', contentHash: 'c'.repeat(64), sizeBytes: 12, storageKey: 'c'.repeat(64) }],
    failedIds: [], now: '2026-08-06T00:00:00.000Z'
  })).resolves.toEqual({ failedIds: [], syncedIds: ['att-1'] });
  expect(port.run).toHaveBeenCalledWith(expect.stringContaining("availability = 'cached'"), [
    'c'.repeat(64), '2026-08-06T00:00:00.000Z', '2026-08-06T00:00:00.000Z', 'att-1'
  ]);
});

function fakePort(): DbPort {
  const port = {
    query: vi.fn(async () => []),
    run: vi.fn(async () => ({ changes: 1, lastInsertRowId: null }))
  } as unknown as DbPort;
  port.transaction = vi.fn(async <T>(task: (tx: DbPort) => Promise<T>): Promise<T> => task(port)) as unknown as DbPort['transaction'];
  return port;
}
