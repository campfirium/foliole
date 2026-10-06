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

it('commits a matching framed receipt before releasing its outbound hold', async () => {
  const transferId = '11'.repeat(32);
  const contentId = '22'.repeat(32);
  mocks.query.mockResolvedValueOnce([{
    content_id: Uint8Array.from({ length: 32 }, () => 0x22),
    receiver_device_id: 'peer-1',
    receiver_library_epoch: 'epoch-1'
  }]).mockResolvedValueOnce([]).mockResolvedValueOnce([{ present: 1 }]);
  mocks.listener?.({
    operation: 'complete_framed_outbound',
    payload: {
      applied_state_hash: '33'.repeat(32), content_id: contentId,
      receiver_device_id: 'peer-1', receiver_library_epoch: 'epoch-1', transfer_id: transferId
    },
    request_id: 'framed-receipt'
  });
  await vi.waitFor(() => expect(mocks.resolve).toHaveBeenCalledWith({
    request_id: 'framed-receipt', result: { receipt_state: 'committed', transfer_id: transferId }
  }));
  expect(mocks.writer).toHaveBeenCalledOnce();
  expect(mocks.run).toHaveBeenCalledWith(
    'DELETE FROM framed_sync_outbound_holds WHERE transfer_id = ?',
    [Uint8Array.from({ length: 32 }, () => 0x11)]
  );
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
