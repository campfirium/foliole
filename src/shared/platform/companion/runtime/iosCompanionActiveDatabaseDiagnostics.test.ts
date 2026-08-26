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
    expect(peerId).toBe('device-desktop');
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

it('projects the current remote Device sync-pack cursor into diagnostics', async () => {
  const { diagnoseIosCompanionDatabase } = await import('./iosCompanionActiveDatabaseDiagnostics');

  const result = await diagnoseIosCompanionDatabase({
    created_at: '2026-08-26T00:00:00.000Z', display_name: 'Studio', group_id: 'group-1',
    local_device_identity_key: 'device-android', devices: [
      device('device-android', 'A5'), device('device-desktop', 'Mac')
    ]
  });

  expect(result.sync_state.pack_cursor).toBe(42);
  expect(runtime.loadCursor).toHaveBeenCalledOnce();
  expect(runtime.query).not.toHaveBeenCalledWith('companionMetaValue', ['sync_pack_cursor']);
});

it('reports no pack cursor when the Sync Group has no remote Device', async () => {
  const { diagnoseIosCompanionDatabase } = await import('./iosCompanionActiveDatabaseDiagnostics');

  const result = await diagnoseIosCompanionDatabase(null);

  expect(result.sync_state.pack_cursor).toBeNull();
  expect(runtime.loadCursor).not.toHaveBeenCalled();
});

function device(id: string, name: string) {
  return {
    canonical_library_path: `/${id}`, contract_version: 1 as const, device_anchor: `${id}-anchor`,
    device_identity_key: id, device_name: name, joined_at: '2026-08-26T00:00:00.000Z',
    last_seen_at: null, left_at: null, platform: 'test', state: 'active' as const,
    updated_at: '2026-08-26T00:00:00.000Z'
  };
}
