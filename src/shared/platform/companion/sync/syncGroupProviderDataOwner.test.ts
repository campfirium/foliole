import { beforeEach, expect, it, vi } from 'vitest';

import { createSyncGroupDeviceIdentity } from '../../../../../lib/platform/syncGroupUnifiedContract';

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
  expect(mocks.run).toHaveBeenCalledWith(expect.stringContaining('(peer_id, stream_name'), [
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

it('loads the active Device credential through the Capacitor database owner', async () => {
  mocks.query.mockResolvedValueOnce([{ device_id: 'device-1', workgroup_key: 'group-key' }]);
  mocks.listener?.({
    operation: 'load_current_credential', payload: { group_id: 'group-1' }, request_id: 'request-key'
  });
  await vi.waitFor(() => expect(mocks.resolve).toHaveBeenCalled());
  expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining('g.workgroup_key'), ['group-1']);
  expect(mocks.resolve).toHaveBeenCalledWith({
    request_id: 'request-key',
    result: { device_id: 'device-1', workgroup_key: 'group-key' }
  });
});

it('rejects an ambiguous active Device credential', async () => {
  mocks.query.mockResolvedValueOnce([
    { device_id: 'device-1', workgroup_key: 'group-key' },
    { device_id: 'device-2', workgroup_key: 'group-key' }
  ]);
  mocks.listener?.({
    operation: 'load_current_credential', payload: { group_id: 'group-1' }, request_id: 'request-key'
  });
  await vi.waitFor(() => expect(mocks.resolve).toHaveBeenCalledWith({
    error: 'sync_group_current_credential_missing', request_id: 'request-key'
  }));
});

it('registers the exact accepted Device identity through the writer queue', async () => {
  const identity = createSyncGroupDeviceIdentity({
    device_anchor: 'a1111111-1111-4111-8111-111111111111', group_id: 'group-1',
    library_path: '/Users/maci/Foliole/foliole.db', path_flavor: 'posix'
  });
  mocks.listener?.({
    operation: 'register_device',
    payload: {
      group_id: 'group-1',
      device: {
        canonical_library_path: identity.canonical_library_path,
        device_anchor: identity.device_anchor,
        device_identity_key: identity.identity_key,
        device_name: 'Maci', path_flavor: 'posix', platform: 'darwin'
      }
    },
    request_id: 'request-3'
  });
  await vi.waitFor(() => expect(mocks.resolve).toHaveBeenCalled());
  expect(mocks.writer).toHaveBeenCalledOnce();
  expect(mocks.run).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO sync_group_devices'),
    expect.arrayContaining(['group-1', identity.identity_key, 'Maci', 'darwin']));
  expect(mocks.resolve).toHaveBeenCalledWith({
    request_id: 'request-3', result: { device_id: identity.identity_key, registered: true }
  });
});
