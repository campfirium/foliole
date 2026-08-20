import { describe, expect, it, vi } from 'vitest';

import {
  loadIosCompanionWorkspaceSyncState,
  saveIosCompanionWorkspaceSyncState
} from './iosCompanionWorkspaceSyncStateStore';

function createHarness(metaRows: Array<{ key: string; value: string }> = []) {
  const connection = {
    beginTransaction: vi.fn(async () => ({ changes: { changes: 0 } })),
    close: vi.fn(async () => undefined),
    commitTransaction: vi.fn(async () => ({ changes: { changes: 0 } })),
    isDBOpen: vi.fn(async () => ({ result: true })),
    open: vi.fn(async () => undefined),
    query: vi.fn(async (sql: string, values: unknown[] = []) => {
      if (sql.includes('key IN')) return { values: metaRows };
      if (sql.includes('companion_meta') && values[0] === 'host_name') return { values: [{ value: 'iPhone' }] };
      return { values: [] };
    }),
    rollbackTransaction: vi.fn(async () => ({ changes: { changes: 0 } })),
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

describe('iosCompanionWorkspaceSyncStateStore', () => {
  it('loads permanent sync metadata without a duplicate snapshot blob', async () => {
    const { connection, manager } = createHarness([
      { key: 'workspace_sync_endpoint_url', value: 'http://192.168.1.5:38641' },
      { key: 'workspace_sync_onboarding_status', value: 'accepted' },
      { key: 'workspace_sync_remembered_targets', value: '["http://192.168.1.5:38641"]' }
    ]);

    const state = await loadIosCompanionWorkspaceSyncState(manager as never);

    expect(state).toMatchObject({
      endpoint_url: 'http://192.168.1.5:38641',
      remembered_targets: ['http://192.168.1.5:38641'],
      sync_onboarding_status: 'accepted',
      workspace_snapshot: null
    });
    expect(connection.query).not.toHaveBeenCalledWith(expect.stringContaining('workspace_snapshot'), expect.anything());
  });

  it('writes metadata atomically and reloads canonical SQLite state', async () => {
    const { connection, manager } = createHarness();
    const state = {
      endpoint_url: 'http://192.168.1.5:38641',
      last_synced_at: null,
      remembered_targets: ['http://192.168.1.5:38641'],
      sync_events: [],
      sync_onboarding_status: 'accepted' as const,
      workspace_snapshot: null
    };

    await saveIosCompanionWorkspaceSyncState(state, manager as never);

    expect(connection.beginTransaction).toHaveBeenCalledTimes(1);
    expect(connection.commitTransaction).toHaveBeenCalledTimes(1);
    expect(connection.rollbackTransaction).not.toHaveBeenCalled();
    expect(connection.run).toHaveBeenCalledWith(
      expect.stringContaining('ON CONFLICT(key) DO UPDATE'),
      ['workspace_sync_endpoint_url', state.endpoint_url, expect.any(String)],
      false
    );
  });

  it('rolls back the metadata transaction when a write fails', async () => {
    const { connection, manager } = createHarness();
    connection.run.mockRejectedValueOnce(new Error('write_failed'));

    await expect(saveIosCompanionWorkspaceSyncState({
      endpoint_url: null,
      last_synced_at: null,
      remembered_targets: [],
      sync_events: [],
      sync_onboarding_status: 'pending',
      workspace_snapshot: null
    }, manager as never)).rejects.toThrow('write_failed');
    expect(connection.rollbackTransaction).toHaveBeenCalledTimes(1);
    expect(connection.commitTransaction).not.toHaveBeenCalled();
  });
});
