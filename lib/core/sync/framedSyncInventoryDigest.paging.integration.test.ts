// @vitest-environment node
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';

import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { createBetterSqliteDbPort } from '../../../electron/database/betterSqliteDbPort.js';
import { initializeDatabaseSchema } from '../database/migrations.js';

import type { DbPort, DbRow } from './dbPort.js';
import { flushRequestSyncInventoryDigests, readRequestSyncInventorySummaries } from './framedSyncInventoryDigest.js';

async function fixture() {
  mkdirSync('.tmp/artifacts/T622', { recursive: true });
  const root = mkdtempSync(path.resolve('.tmp/artifacts/T622/digest-snapshot-'));
  const file = path.join(root, 'library.db');
  const writer = new Database(file);
  initializeDatabaseSchema(writer);
  writer.pragma('journal_mode=WAL');
  const ids = Array.from({ length: 769 }, (_, index) => `node-${String(index).padStart(4, '0')}`);
  const insert = writer.prepare(`INSERT INTO framed_sync_inventory VALUES
    ('node', ?, ?, '["v1"]', '[]', '[]', '[]', '[]')`);
  writer.transaction(() => {
    for (const id of ids) insert.run(id, JSON.stringify(['1'.repeat(64), 'v1', []]));
  })();
  const write = createBetterSqliteDbPort(writer);
  await write.transaction(flushRequestSyncInventoryDigests);
  const reader = new Database(file, { readonly: true });
  const read = createBetterSqliteDbPort(reader, { transactionMode: 'deferred' });
  return { ids, write, read, writer, close() {
    reader.close(); writer.close(); rmSync(root, { recursive: true });
  } };
}

function observeDigestPayloads(db: DbPort, sizes: number[], afterFirst?: () => Promise<void>): DbPort {
  let seen = false;
  return {
    run: (sql, params) => db.run(sql, params),
    transaction: task => db.transaction(tx => task(observeDigestPayloads(tx, sizes, afterFirst))),
    async query<T extends DbRow>(sql: string, params?: Parameters<DbPort['query']>[1]): Promise<T[]> {
      const rows = await db.query<T>(sql, params);
      if (rows.length && Object.hasOwn(rows[0]!, 'shared_state_hash')) {
        sizes.push(rows.length);
        if (!seen) { seen = true; await afterFirst?.(); }
      }
      return rows;
    }
  };
}

it.each([false, true])('bounds each digest return while preserving the full snapshot (scoped=%s)', async scoped => {
  const library = await fixture();
  try {
    const ids = scoped ? [...library.ids.filter((_, index) => index % 2 === 0), 'absent', library.ids[0]!] : undefined;
    const expected = await library.read.transaction(db => readRequestSyncInventorySummaries(db, ids));
    const sizes: number[] = [];
    const actual = await library.read.transaction(db => readRequestSyncInventorySummaries(
      observeDigestPayloads(db, sizes), ids));
    expect(actual).toEqual(expected);
    expect(actual.map(entry => entry.globalId)).toEqual(scoped
      ? library.ids.filter((_, index) => index % 2 === 0) : library.ids);
    expect(Math.max(...sizes)).toBeLessThanOrEqual(256);
  } finally { library.close(); }
});

it('keeps later digest pages in the original WAL snapshot when another writer commits', async () => {
  const library = await fixture();
  try {
    const expected = await library.read.transaction(readRequestSyncInventorySummaries);
    const sizes: number[] = [];
    const actual = await library.read.transaction(db => readRequestSyncInventorySummaries(
      observeDigestPayloads(db, sizes, async () => {
        await library.write.transaction(async tx => {
          await tx.run('UPDATE framed_sync_inventory SET content_hash=? WHERE object_id=?',
            [JSON.stringify(['2'.repeat(64), 'v1', []]), library.ids.at(-1)!]);
          await flushRequestSyncInventoryDigests(tx, [library.ids.at(-1)!]);
        });
      })));
    expect(actual).toEqual(expected);
    const next = await library.read.transaction(readRequestSyncInventorySummaries);
    expect(next.at(-1)?.globalId).toBe(library.ids.at(-1));
    expect(next.at(-1)?.sharedStateHash).not.toEqual(expected.at(-1)?.sharedStateHash);
    expect(next.slice(0, -1)).toEqual(expected.slice(0, -1));
    expect(Math.max(...sizes)).toBeLessThanOrEqual(256);
  } finally { library.close(); }
});

it('rejects an interrupted read without returning a partial inventory and releases its snapshot', async () => {
  const library = await fixture();
  try {
    await expect(library.read.transaction(db => readRequestSyncInventorySummaries(
      observeDigestPayloads(db, [], async () => { throw new Error('request cancelled'); }))))
      .rejects.toThrow('request cancelled');
    const recovered = await library.read.transaction(readRequestSyncInventorySummaries);
    expect(recovered.map(entry => entry.globalId)).toEqual(library.ids);
    expect(library.writer.pragma('wal_checkpoint(TRUNCATE)')).toEqual([{ busy: 0, log: 0, checkpointed: 0 }]);
  } finally { library.close(); }
});
