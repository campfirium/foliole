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
    runWriter: (task: (db: unknown) => Promise<unknown>) => task({ query: mocks.query, run: mocks.run })
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
