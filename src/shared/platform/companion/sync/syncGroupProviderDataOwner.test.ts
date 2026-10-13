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

it.each([['group-1', true], ['other-group', false]])('validates group admission without writing: %s', async (groupId, allowed) => {
  mocks.query.mockResolvedValueOnce([{ group_id: 'group-1', local_device_identity_key: 'provider' }]);
  mocks.listener?.({ operation: 'validate_join', request_id: 'admission', payload: {
    contract_version: 1, group_id: groupId, ephemeral_public_key: `BA${'A'.repeat(85)}`,
    device: { canonical_library_path: '/library', device_anchor: 'a1111111-1111-4111-8111-111111111111',
      device_name: 'Applicant', path_flavor: 'posix', platform: 'ios-capacitor' }
  } });
  await vi.waitFor(() => expect(mocks.resolve).toHaveBeenCalledWith(allowed
    ? { request_id: 'admission', result: { allowed: true } }
    : { request_id: 'admission', error: 'sync_group_identity_mismatch' }));
  expect(mocks.run).not.toHaveBeenCalled();
  expect(mocks.writer).not.toHaveBeenCalled();
});

beforeEach(async () => {
  mocks.query.mockReset().mockResolvedValue([]);
  mocks.resolve.mockReset().mockResolvedValue(undefined);
  mocks.run.mockReset().mockResolvedValue({ changes: 0, lastInsertRowId: null });
  mocks.writer.mockReset().mockImplementation((task: () => Promise<unknown>) => task());
  await ensureCompanionSyncGroupDataOwner();
});

it.each(['record_supply_cursor', 'complete_framed_outbound', 'create_snapshot'])(
  'rejects retired operation %s without database access', async operation => {
    mocks.listener?.({ operation, payload: {}, request_id: 'retired-request' });
    await vi.waitFor(() => expect(mocks.resolve).toHaveBeenCalledWith({
      request_id: 'retired-request', error: 'sync_group_data_operation_unsupported'
    }));
    expect(mocks.writer).not.toHaveBeenCalled();
    expect(mocks.query).not.toHaveBeenCalled();
    expect(mocks.run).not.toHaveBeenCalled();
  }
);

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
