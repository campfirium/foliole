import { describe, expect, it, vi } from 'vitest';

import { createIosCompanionSyncPackCursorStore } from './iosCompanionSyncPackCursorStore';

function createHarness(storedValue?: unknown, committedValue?: unknown,
  restoreId: string | null = null, completed = 0) {
  const connection = {
    close: vi.fn(async () => undefined),
    isDBOpen: vi.fn(async () => ({ result: false })),
    open: vi.fn(async () => undefined),
    query: vi.fn(async (sql: string) => ({ values: sql.includes('sync_pack_receive_progress')
      ? committedValue === undefined ? [] : [{ completed, cursor_state_seq: committedValue,
        frontier_state_seq: 8, restore_id: restoreId, source_epoch: 'epoch-a' }]
      : storedValue === undefined ? [] : [{ value: storedValue }] })),
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
  it('re-enumerates a legacy cursor from zero while retaining its stored value', async () => {
    const { connection, manager } = createHarness('12');

    await expect(createIosCompanionSyncPackCursorStore(manager as never, 'device-b').loadCursor())
      .resolves.toBe(0);
    expect(connection.query).toHaveBeenCalledWith(expect.stringContaining('sync_peer_cursors'),
      ['device-b', 'sync-pack-receive']);
    expect(connection.run).not.toHaveBeenCalled();
    expect(connection.close).not.toHaveBeenCalled();
    expect(manager.closeConnection).toHaveBeenCalledWith('foliole-companion', false);
  });

  it('resumes from a committed page when the outer cursor save was interrupted', async () => {
    const { connection, manager } = createHarness('3', 5);

    await expect(createIosCompanionSyncPackCursorStore(manager as never, 'device-b').loadCursor()).resolves.toBe(5);
    expect(connection.query).toHaveBeenCalledWith(expect.stringContaining('sync_pack_receive_progress'),
      ['device-b']);
    expect(connection.query).not.toHaveBeenCalledWith(expect.stringContaining('sync_peer_cursors'),
      expect.anything());
  });

  it('resumes the same restore and rejects a changed event during partial restore', async () => {
    const { manager } = createHarness('9', 5, 'restore-a');
    const store = createIosCompanionSyncPackCursorStore(manager as never, 'device-b');

    await expect(store.loadRestoreCursor!('restore-a')).resolves.toBe(5);
    await expect(store.loadRestorePosition!('restore-a')).resolves.toEqual({
      cursor: 5, frontierStateSeq: 8, sourceEpoch: 'epoch-a'
    });
    await expect(store.loadRestoreCursor!('restore-b'))
      .rejects.toThrow('sync_group_restore_event_changed');
  });

  it('starts a newly authorized restore from zero after an interrupted ordinary round', async () => {
    const { manager } = createHarness('9', 5);
    await expect(createIosCompanionSyncPackCursorStore(manager as never, 'device-b')
      .loadRestorePosition!('restore-a')).resolves.toEqual({ cursor: 0 });
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

  it('rejects corrupt committed cursor state', async () => {
    const { manager } = createHarness('-1', -1);

    await expect(createIosCompanionSyncPackCursorStore(manager as never).loadCursor())
      .rejects.toThrow('invalid_ios_sync_pack_cursor');
  });
});

it('retains the ordinary round identity only while its committed frontier is unfinished', async () => {
  const pending = createHarness('3', 5);
  await expect(createIosCompanionSyncPackCursorStore(pending.manager as never, 'device-b')
    .loadPosition!()).resolves.toEqual({ cursor: 5, frontierStateSeq: 8, sourceEpoch: 'epoch-a' });
  const finished = createHarness('8', 8, null, 1);
  await expect(createIosCompanionSyncPackCursorStore(finished.manager as never, 'device-b')
    .loadPosition!()).resolves.toEqual({ cursor: 8 });
  const restore = createHarness('3', 5, 'restore-a');
  await expect(createIosCompanionSyncPackCursorStore(restore.manager as never, 'device-b')
    .loadPosition!()).rejects.toThrow('sync_group_restore_event_changed');
});
