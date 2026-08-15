import { beforeEach, describe, expect, it, vi } from 'vitest';

const database = vi.hoisted(() => ({ keys: new Map<string, string>(), nonces: new Set<string>() }));
vi.mock('../database/syncGroupWorkgroupStore.js', () => ({
  consumeDesktopSyncGroupNonce: (_groupId: string, identity: string) => {
    if (database.nonces.has(identity)) return false;
    database.nonces.add(identity);
    return true;
  },
  loadDesktopSyncGroupWorkgroupKey: (groupId: string) => database.keys.get(groupId) ?? null,
  saveDesktopSyncGroupWorkgroupKey: (groupId: string, key: string) => {
    const existing = database.keys.get(groupId);
    if (existing && existing !== key) throw new Error('sync_group_workgroup_key_mismatch');
    database.keys.set(groupId, key);
  }
}));

describe('desktop workgroup key store', () => {
  beforeEach(() => {
    database.keys.clear();
    database.nonces.clear();
  });

  it('creates one group key in the library database', async () => {
    const store = await import('./workgroupKeyStore.js');
    const first = store.enableDesktopWorkgroupKey('group-1');
    expect(first.group_tag).toMatch(/^[a-f0-9]{32}$/u);
    expect(store.enableDesktopWorkgroupKey('group-1')).toEqual(first);
    expect(store.loadDesktopWorkgroupKey('group-1')).toMatchObject(first);
    expect(database.keys.get('group-1')).toBe(first.group_key);
  });

  it('rejects replacing a group key and persists nonce consumption through the database', async () => {
    const store = await import('./workgroupKeyStore.js');
    const first = store.enableDesktopWorkgroupKey('group-1');
    const other = Buffer.alloc(32, 7).toString('base64url');
    expect(() => store.saveDesktopWorkgroupKey({ groupId: 'group-1', groupKey: other }))
      .toThrow('sync_group_workgroup_key_mismatch');
    expect(store.loadDesktopWorkgroupKey('group-1')?.group_key).toBe(first.group_key);
    expect(store.consumeDesktopWorkgroupNonce('group-1', 'nonce-1')).toBe(true);
    expect(store.consumeDesktopWorkgroupNonce('group-1', 'nonce-1')).toBe(false);
  });
});
