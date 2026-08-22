import { beforeEach, expect, it, vi } from 'vitest';

const runtime = vi.hoisted(() => ({
  loadCursor: vi.fn(async () => 42),
  query: vi.fn(async (name: string, args?: unknown[]) => {
    if (name !== 'companionMetaValue') return [];
    if (args?.[0] === 'workspace_sync_endpoint_url') {
      return [{ value: 'http://desktop.test:38641' }];
    }
    if (args?.[0] === 'workspace_sync_events') return [{ value: '[]' }];
    throw new Error(`Unexpected legacy meta read: ${String(args?.[0])}`);
  })
}));

vi.mock('../sync/cursor/iosCompanionSyncPackCursorStore', () => ({
  createIosCompanionSyncPackCursorStore: vi.fn((_manager, peerId) => {
    expect(peerId).toBe('authorization-desktop');
    return { loadCursor: runtime.loadCursor };
  })
}));

vi.mock('./iosCompanionActiveDatabase', () => ({
  queryIosCompanionDatabase: runtime.query
}));

vi.mock('./iosCompanionDatabaseBootstrap', () => ({
  getIosCompanionDatabaseOwner: () => ({
    databasePath: '/library/Data/foliole.db',
    platform: 'android'
  })
}));

beforeEach(() => {
  runtime.loadCursor.mockClear();
  runtime.query.mockClear();
});

it('projects the current authorization-scoped sync-pack cursor into diagnostics', async () => {
  const { diagnoseIosCompanionDatabase } = await import('./iosCompanionActiveDatabaseDiagnostics');

  const result = await diagnoseIosCompanionDatabase({
    device_id: 'authorization-android',
    device_name: 'A5',
    is_paired: true,
    remote_peer_id: ' authorization-desktop '
  });

  expect(result.sync_state.pack_cursor).toBe(42);
  expect(runtime.loadCursor).toHaveBeenCalledOnce();
  expect(runtime.query).not.toHaveBeenCalledWith('companionMetaValue', ['sync_pack_cursor']);
});

it('reports no pack cursor when the pairing has no current peer authorization', async () => {
  const { diagnoseIosCompanionDatabase } = await import('./iosCompanionActiveDatabaseDiagnostics');

  const result = await diagnoseIosCompanionDatabase({ is_paired: false });

  expect(result.sync_state.pack_cursor).toBeNull();
  expect(runtime.loadCursor).not.toHaveBeenCalled();
});
