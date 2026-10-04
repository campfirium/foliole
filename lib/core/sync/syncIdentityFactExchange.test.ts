import { expect, it } from 'vitest';

import { exchangeSyncIdentityNodeFactPages } from './syncIdentityFactExchange.js';
import { buildSyncIdentityPackPage, type SyncIdentityPackPage } from './syncIdentityPackPage.js';

function page(id: string) {
  return buildSyncIdentityPackPage({ group_id: 'group', source_peer_id: 'source', target_peer_id: 'target',
    source_view_id: '12345678-1234-1234-1234-123456789abc', page_index: 0, previous_page_id: null,
    objects: [{ object_type: 'node', object_id: id, fingerprint: 'a'.repeat(64) }],
    facts: { section: 'head', after: null, limit: 64, digest: 'b'.repeat(64) } });
}

it('stages original ancestor facts before one child head while keeping a contiguous receipt chain', async () => {
  const transferred: SyncIdentityPackPage[] = [];
  const result = await exchangeSyncIdentityNodeFactPages({ page: page('a-child'), digest: 'b'.repeat(64),
    readParent: async (child) => child.objects[0]?.object_id === 'a-child' ? page('z-parent') : null,
    transfer: async (next) => {
      transferred.push(next);
      return { applied: true, ...(next.facts?.section !== 'head' ? { factTail: { nextAfter: null } } : {}) };
    } });
  expect(transferred.map((next) => [next.objects[0]?.object_id, next.facts?.section])).toEqual([
    ['z-parent', 'versions'], ['z-parent', 'parents'], ['z-parent', 'reviews'],
    ['a-child', 'versions'], ['a-child', 'parents'], ['a-child', 'reviews'], ['a-child', 'head']
  ]);
  expect(transferred.map((next) => next.page_index)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  expect(transferred.slice(1).map((next) => next.previous_page_id)).toEqual(
    transferred.slice(0, -1).map((next) => next.page_id));
  expect(result).toEqual({ page: transferred[6], pageCount: 7, appliedPages: 7 });
});

it('rejects a structural parent cycle before any fact is transmitted', async () => {
  let transmitted = false;
  await expect(exchangeSyncIdentityNodeFactPages({ page: page('child'), digest: 'b'.repeat(64),
    readParent: async (child) => page(child.objects[0]?.object_id === 'child' ? 'parent' : 'child'),
    transfer: async () => { transmitted = true; return { applied: true }; }
  })).rejects.toThrow('sync_identity_fact_parent_invalid');
  expect(transmitted).toBe(false);
});
