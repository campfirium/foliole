import { expect, it } from 'vitest';

import { syncIdentityPartitionDigest, type SyncIdentityEntry } from './syncIdentityDigest.js';
import { diffSyncIdentityGlobalPages, type SyncIdentityGlobalPage } from './syncIdentityPagedDiff.js';

const fingerprint = (character: string) => character.repeat(64);
const entry = (id: string, hash = 'a'): SyncIdentityEntry => ({
  object_type: 'node', object_id: id, fingerprint: fingerprint(hash)
});

function fixedView(rows: SyncIdentityEntry[], pageSize = 2) {
  const inventory = { row_count: rows.length, digest: syncIdentityPartitionDigest(rows) };
  const read = async (after: SyncIdentityGlobalPage['nextAfter']): Promise<SyncIdentityGlobalPage> => {
    const start = after ? rows.findIndex((row) => row.object_id === after.object_id) + 1 : 0;
    const entries = rows.slice(start, start + pageSize);
    return { entries, nextAfter: start + entries.length < rows.length ? {
      object_type: entries.at(-1)!.object_type, object_id: entries.at(-1)!.object_id
    } : null };
  };
  return { inventory, read };
}

async function collect(left: ReturnType<typeof fixedView>, right: ReturnType<typeof fixedView>) {
  const result = [];
  for await (const difference of diffSyncIdentityGlobalPages(
    left.inventory, right.inventory, left.read, right.read)) result.push(difference);
  return result;
}

it('finds an older unseen ID on a first direct exchange and a changed hash', async () => {
  const left = fixedView([entry('0001'), entry('0002'), entry('9000', 'b')]);
  const right = fixedView([entry('0002'), entry('9000', 'c')], 1);
  expect((await collect(left, right)).map((row) => [row.kind,
    'source' in row ? row.source.object_id : row.receiver.object_id])).toEqual([
    ['source_only', '0001'], ['divergent', '9000']
  ]);
});

it('bounds each page and rejects an omitted source row before accepting the scan', async () => {
  const left = fixedView([entry('a'), entry('b'), entry('c')], 1);
  const right = fixedView([entry('a'), entry('b'), entry('c')], 1);
  const missing = { ...left, read: async (after: SyncIdentityGlobalPage['nextAfter']) => {
    if (after?.object_id === 'a') return { entries: [entry('c')], nextAfter: null };
    return left.read(after);
  } };
  await expect(collect(missing, right)).rejects.toThrow('sync_identity_global_inventory_mismatch');
});

it('rejects a page that repeats its cursor', async () => {
  const left = fixedView([entry('a'), entry('b')], 1);
  const right = fixedView([]);
  const repeated = { ...left, read: async (after: SyncIdentityGlobalPage['nextAfter']) =>
    after ? { entries: [entry('a')], nextAfter: null } : left.read(after) };
  await expect(collect(repeated, right)).rejects.toThrow('sync_identity_global_page_order_invalid');
});

it('accepts SQLite BINARY order for Unicode IDs across pages', async () => {
  const left = fixedView([entry('\ue000'), entry('😀')], 1);
  const right = fixedView([entry('😀')], 1);
  expect((await collect(left, right)).map((row) => row.kind)).toEqual(['source_only']);
});
