import { expect, it } from 'vitest';

import { buildSyncIdentityPackPage, parseSyncIdentityPackPage } from './syncIdentityPackPage.js';

const input = {
  group_id: 'group-1', source_peer_id: 'source', target_peer_id: 'receiver',
  source_view_id: '12345678-1234-1234-1234-123456789abc', page_index: 0,
  previous_page_id: null,
  objects: [{ object_type: 'node', object_id: 'node-a', fingerprint: 'a'.repeat(64) }]
} as const;

it('derives a stable candidate page ID from the source view and object fingerprints', () => {
  const first = buildSyncIdentityPackPage({ ...input, objects: [...input.objects] });
  expect(parseSyncIdentityPackPage(first)).toEqual(first);
  expect(buildSyncIdentityPackPage({ ...input, objects: [...input.objects] }).page_id).toBe(first.page_id);
  expect(() => parseSyncIdentityPackPage({ ...first,
    objects: [{ ...first.objects[0], fingerprint: 'b'.repeat(64) }]
  })).toThrow('sync_identity_pack_page_id_mismatch');
  expect(() => parseSyncIdentityPackPage({ ...first, contract: 'bounded-v1' }))
    .toThrow('sync_identity_pack_contract_unsupported');
  expect(() => parseSyncIdentityPackPage({ ...first, from_state_seq: 7 }))
    .toThrow('sync_identity_pack_page_invalid');
});

it('rejects out of order, duplicate, and unchained pages', () => {
  expect(() => buildSyncIdentityPackPage({ ...input, page_index: 1,
    objects: [...input.objects] })).toThrow('sync_identity_pack_page_invalid');
  expect(() => buildSyncIdentityPackPage({ ...input,
    objects: [...input.objects, ...input.objects] })).toThrow('sync_identity_pack_page_invalid');
  expect(() => buildSyncIdentityPackPage({ ...input,
    objects: [{ ...input.objects[0], object_id: 'z' }, ...input.objects]
  })).toThrow('sync_identity_pack_page_invalid');
  const first = buildSyncIdentityPackPage({ ...input, objects: [...input.objects] });
  const next = buildSyncIdentityPackPage({ ...input, page_index: 1,
    previous_page_id: first.page_id, objects: [] });
  expect(parseSyncIdentityPackPage(next)).toEqual(next);
});

it('binds restore pages to one event and verified full collection', () => {
  const page = buildSyncIdentityPackPage({ ...input, objects: [...input.objects],
    restore_id: 'restore-1', restore_set_id: 'b'.repeat(64) });
  expect(parseSyncIdentityPackPage(page)).toEqual(page);
  expect(page.page_id).not.toBe(buildSyncIdentityPackPage({ ...input,
    objects: [...input.objects] }).page_id);
  expect(() => parseSyncIdentityPackPage({ ...page, restore_id: 'restore-2' }))
    .toThrow('sync_identity_pack_page_id_mismatch');
  expect(() => buildSyncIdentityPackPage({ ...input, objects: [...input.objects],
    restore_id: 'restore-1' })).toThrow('sync_identity_pack_page_invalid');
});
