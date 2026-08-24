import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  listener: null as null | ((event: Record<string, unknown>) => void),
  query: vi.fn(),
  resolve: vi.fn(),
  run: vi.fn(),
  controlWriter: vi.fn(),
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
  runCompanionSyncControlWriterTask: mocks.controlWriter,
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
  mocks.controlWriter.mockReset().mockImplementation((task: () => Promise<unknown>) => task());
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
  expect(mocks.run).toHaveBeenCalledWith(expect.stringContaining('(authorization_id, stream_name'), [
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

it('loads the active authorization credential through the Capacitor database owner', async () => {
  mocks.query.mockResolvedValueOnce([{ authorization_id: 'auth-1', workgroup_key: 'group-key' }]);
  mocks.listener?.({
    operation: 'load_current_credential', payload: { group_id: 'group-1' }, request_id: 'request-key'
  });
  await vi.waitFor(() => expect(mocks.resolve).toHaveBeenCalled());
  expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining('groups.workgroup_key'), ['group-1']);
  expect(mocks.resolve).toHaveBeenCalledWith({
    request_id: 'request-key',
    result: { authorization_id: 'auth-1', workgroup_key: 'group-key' }
  });
});

it('rejects an ambiguous active authorization credential', async () => {
  mocks.query.mockResolvedValueOnce([
    { authorization_id: 'auth-1', workgroup_key: 'group-key' },
    { authorization_id: 'auth-2', workgroup_key: 'group-key' }
  ]);
  mocks.listener?.({
    operation: 'load_current_credential', payload: { group_id: 'group-1' }, request_id: 'request-key'
  });
  await vi.waitFor(() => expect(mocks.resolve).toHaveBeenCalledWith({
    error: 'sync_group_current_credential_missing', request_id: 'request-key'
  }));
});

it('allocates the smallest unused member profile inside the writer transaction', async () => {
  mocks.query
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([{ host_name: 'Maci' }, { host_name: 'Maci 2' }]);
  mocks.listener?.({
    operation: 'authorize_member',
    payload: {
      approved_by_host_name: 'Maci', group_id: 'group-1',
      member: {
        authorization_id: 'request-3', host_platform: 'darwin', host_name: 'Maci',
        joined_at: '2026-08-12T00:00:00.000Z'
      }
    },
    request_id: 'request-3'
  });
  await vi.waitFor(() => expect(mocks.resolve).toHaveBeenCalled());
  expect(mocks.controlWriter).toHaveBeenCalledOnce();
  expect(mocks.writer).not.toHaveBeenCalled();
  expect(mocks.run).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO sync_group_members'), [
    'group-1', 'Maci 3', 'darwin', 'Maci', 'request-3',
    '2026-08-12T00:00:00.000Z', expect.any(String)
  ]);
  expect(mocks.resolve).toHaveBeenCalledWith({
    request_id: 'request-3', result: { authorized: true, host_name: 'Maci 3' }
  });
});
