import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  listener: null as null | ((event: Record<string, unknown>) => void),
  query: vi.fn(),
  resolve: vi.fn(),
  run: vi.fn(),
  writer: vi.fn()
}));

vi.mock('../../companionWorkspaceRuntimeRepository', () => ({
  FolioleCompanionSync: {
    addListener: vi.fn((_name: string, listener: (event: Record<string, unknown>) => void) => {
      mocks.listener = listener;
      return Promise.resolve({ remove: vi.fn() });
    }),
    resolveSyncGroupDataRequest: mocks.resolve
  }
}));
vi.mock('../../companionSyncWriterQueue', () => ({
  runCompanionSyncWriterTask: mocks.writer
}));
vi.mock('../runtime/iosCompanionDatabaseBootstrap', () => ({
  getIosCompanionDatabaseOwner: () => ({
    read: (task: (db: unknown) => Promise<unknown>) => task({ query: mocks.query, run: mocks.run }),
    runWriter: (task: (db: unknown) => Promise<unknown>) => task({
      query: mocks.query, run: mocks.run,
      transaction: (work: (tx: unknown) => Promise<unknown>) => work({ query: mocks.query, run: mocks.run })
    })
  })
}));

import { ensureCompanionSyncGroupDataOwner } from './syncGroupProviderDataOwner';

beforeEach(async () => {
  mocks.query.mockReset();
  mocks.resolve.mockReset().mockResolvedValue(undefined);
  mocks.run.mockReset().mockResolvedValue({ changes: 0, lastInsertRowId: null });
  mocks.writer.mockReset().mockImplementation((task: () => Promise<unknown>) => task());
  await ensureCompanionSyncGroupDataOwner();
});

it('runs provider live-database writes through the shared writer queue', async () => {
  mocks.listener?.({
    operation: 'record_supply_cursor',
    payload: { from_cursor: 4, peer_id: 'desktop-c', to_cursor: 9 },
    request_id: 'request-1'
  });
  await vi.waitFor(() => expect(mocks.resolve).toHaveBeenCalled());
  expect(mocks.writer).toHaveBeenCalledOnce();
  expect(mocks.run).toHaveBeenCalledWith(expect.stringContaining('sync_peer_cursors'), [
    'desktop-c', '4:9', expect.any(String)
  ]);
  expect(mocks.resolve).toHaveBeenCalledWith({ request_id: 'request-1', result: { recorded: true } });
});

it('creates provider read snapshots through the Capacitor database owner', async () => {
  mocks.listener?.({
    operation: 'create_snapshot',
    payload: { target_path: '/data/user/0/com.foliole.android/cache/foliole-provider-source-1.db' },
    request_id: 'request-2'
  });
  await vi.waitFor(() => expect(mocks.resolve).toHaveBeenCalled());
  expect(mocks.writer).toHaveBeenCalledOnce();
  expect(mocks.run).toHaveBeenCalledWith(
    "VACUUM INTO '/data/user/0/com.foliole.android/cache/foliole-provider-source-1.db'"
  );
  expect(mocks.resolve).toHaveBeenCalledWith({
    request_id: 'request-2',
    result: { snapshot_path: '/data/user/0/com.foliole.android/cache/foliole-provider-source-1.db' }
  });
});

it('allocates the smallest unused member profile inside the writer transaction', async () => {
  mocks.query
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([{ device_name: 'Maci' }, { device_name: 'Maci 2' }]);
  mocks.listener?.({
    operation: 'authorize_member',
    payload: {
      approved_by_device_id: 'Maci', device_id: 'Maci', group_id: 'group-1',
      member: {
        authorization_id: 'request-3', device_kind: 'darwin', device_name: 'Maci',
        joined_at: '2026-08-12T00:00:00.000Z'
      }
    },
    request_id: 'request-3'
  });
  await vi.waitFor(() => expect(mocks.resolve).toHaveBeenCalled());
  expect(mocks.run).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO sync_group_members'), [
    'group-1', 'Maci 3', 'darwin', 'Maci 3', 'Maci', 'request-3',
    '2026-08-12T00:00:00.000Z', expect.any(String)
  ]);
  expect(mocks.resolve).toHaveBeenCalledWith({
    request_id: 'request-3', result: { authorized: true, device_id: 'Maci 3', device_name: 'Maci 3' }
  });
});
