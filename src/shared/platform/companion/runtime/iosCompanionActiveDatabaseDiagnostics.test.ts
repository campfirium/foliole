import { beforeEach, expect, it, vi } from 'vitest';

const runtime = vi.hoisted(() => ({
  query: vi.fn(async (name: string, args?: unknown[]) => {
    if (name !== 'companionMetaValue') return [];
    if (args?.[0] === 'workspace_sync_endpoint_url') {
      return [{ value: 'http://desktop.test:38641' }];
    }
    if (args?.[0] === 'workspace_sync_events') return [{ value: '[]' }];
    throw new Error(`Unexpected legacy meta read: ${String(args?.[0])}`);
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
  runtime.query.mockClear();
});

it('projects device identity and connection without retired cursor reads', async () => {
  const { diagnoseIosCompanionDatabase } = await import('./iosCompanionActiveDatabaseDiagnostics');

  const result = await diagnoseIosCompanionDatabase({
    created_at: '2026-08-26T00:00:00.000Z', display_name: 'Studio', group_id: 'group-1',
    local_device_identity_key: 'device-android', devices: [
      device('device-android', 'A5'), device('device-desktop', 'Mac')
    ]
  });

  expect(result.identity.device_id).toBe('device-android');
  expect(result.connection).toMatchObject({ state: 'ready', endpoint_url: 'http://desktop.test:38641' });
  expect(result.sync_state).not.toHaveProperty('pack_cursor');
  expect(runtime.query).not.toHaveBeenCalledWith('companionMetaValue', ['sync_pack_cursor']);
});

it('reports a missing connection without a Sync Group', async () => {
  const { diagnoseIosCompanionDatabase } = await import('./iosCompanionActiveDatabaseDiagnostics');

  const result = await diagnoseIosCompanionDatabase(null);

  expect(result.identity.device_id).toBeNull();
  expect(result.connection.state).toBe('missing');
});

function device(id: string, name: string) {
  return {
    canonical_library_path: `/${id}`, contract_version: 1 as const, device_anchor: `${id}-anchor`,
    device_identity_key: id, device_name: name, joined_at: '2026-08-26T00:00:00.000Z',
    last_seen_at: null, left_at: null, platform: 'test', state: 'active' as const,
    updated_at: '2026-08-26T00:00:00.000Z'
  };
}
