import { describe, expect, it, vi } from 'vitest';

import { createIosCompanionSyncPackCursorStore } from './iosCompanionSyncPackCursorStore';

function createHarness(storedValue?: unknown) {
  const connection = {
    close: vi.fn(async () => undefined),
    isDBOpen: vi.fn(async () => ({ result: false })),
    open: vi.fn(async () => undefined),
    query: vi.fn(async () => ({ values: storedValue === undefined ? [] : [{ value: storedValue }] })),
    run: vi.fn(async () => ({ changes: { changes: 1 } }))
  };
  const manager = {
    closeConnection: vi.fn(async () => undefined),
    createConnection: vi.fn(async () => connection),
    isConnection: vi.fn(async () => ({ result: false })),
    retrieveConnection: vi.fn(async () => connection)
  };
  return { connection, manager };
}

describe('iosCompanionSyncPackCursorStore', () => {
  it('loads the permanent sync-pack cursor for one source Device', async () => {
    const { connection, manager } = createHarness('12');

    await expect(createIosCompanionSyncPackCursorStore(manager as never, 'device-b').loadCursor()).resolves.toBe(12);
    expect(connection.query).toHaveBeenCalledWith(expect.stringContaining('sync_peer_cursors'),
      ['device-b', 'sync-pack-receive']);
    expect(connection.close).not.toHaveBeenCalled();
    expect(manager.closeConnection).toHaveBeenCalledWith('foliole-companion', false);
  });

  it('upserts and clears the permanent cursor', async () => {
    const { connection, manager } = createHarness();
    const store = createIosCompanionSyncPackCursorStore(manager as never, 'device-c');

    await expect(store.saveCursor(7)).resolves.toBe(7);
    await expect(store.saveCursor(null)).resolves.toBeNull();
    expect(connection.run).toHaveBeenCalledWith(
      expect.stringContaining('ON CONFLICT(peer_id, stream_name) DO UPDATE'),
      ['device-c', 'sync-pack-receive', '7', expect.any(String)],
      false
    );
    expect(connection.run).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM sync_peer_cursors'),
      ['device-c', 'sync-pack-receive'], false);
  });

  it('rejects corrupt stored cursor state', async () => {
    const { manager } = createHarness('-1');

    await expect(createIosCompanionSyncPackCursorStore(manager as never).loadCursor())
      .rejects.toThrow('invalid_ios_sync_pack_cursor');
  });
});
