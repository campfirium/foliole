import { expect, it } from 'vitest';

import { createSyncGroupDeviceIdentity } from '../../platform/syncGroupUnifiedContract.js';

import type { DbParams, DbPort, DbRow, DbRunResult } from './dbPort.js';
import { applySyncPackGroupFactsWithDbPort } from './syncPackGroupFactsExecutor.js';

const GROUP = {
  created_at: '2026-08-01T00:00:00.000Z', display_name: 'Studio',
  group_id: 'group-1'
};
const UPDATED_AT = '2026-08-27T00:00:00.000Z';

function device(anchor: string, name: string, path: string) {
  const identity = createSyncGroupDeviceIdentity({
    device_anchor: anchor, group_id: GROUP.group_id, library_path: path, path_flavor: 'posix'
  });
  return {
    canonical_library_path: identity.canonical_library_path,
    device_anchor: identity.device_anchor,
    device_identity_key: identity.identity_key,
    device_name: name,
    group_id: GROUP.group_id,
    joined_at: GROUP.created_at,
    last_seen_at: UPDATED_AT,
    left_at: null,
    platform: 'darwin',
    state: 'active' as const,
    updated_at: UPDATED_AT
  };
}

function port(args: { incomingGroup?: typeof GROUP; knownSource?: boolean }) {
  const local = device('a1111111-1111-4111-8111-111111111111', 'Joiner', '/joiner/foliole.db');
  const source = device('b2222222-2222-4222-8222-222222222222', 'Provider', '/provider/foliole.db');
  const runs: Array<{ params?: DbParams; sql: string }> = [];
  const value: DbPort = {
    query: async <T extends DbRow>(sql: string) => {
      if (sql.includes('SELECT * FROM "inc".sync_groups')) return [args.incomingGroup ?? GROUP] as unknown as T[];
      if (sql.includes('JOIN main.sync_group_local_state')) {
        return [{ ...GROUP, created_at: '2026-08-27T00:00:00.000Z',
          local_device_identity_key: local.device_identity_key }] as unknown as T[];
      }
      if (sql.includes('SELECT * FROM "inc".sync_group_devices')) return [source, local] as unknown as T[];
      if (sql.includes('main.sync_group_devices')) {
        return (args.knownSource ? [source] : []) as unknown as T[];
      }
      return [];
    },
    run: async (sql: string, params?: DbParams): Promise<DbRunResult> => {
      runs.push({ sql, ...(params ? { params } : {}) });
      return { changes: 1, lastInsertRowId: null };
    },
    transaction: async <T>(execute: (tx: DbPort) => Promise<T>) => execute(value)
  };
  return { local, runs, source, value };
}

it('bootstraps the authenticated provider Device before merging first Sync Pack content', async () => {
  const fixture = port({ knownSource: false });
  const result = await applySyncPackGroupFactsWithDbPort(fixture.value, {
    sourcePeerId: fixture.source.device_identity_key
  });

  expect(result).toEqual({ appliedFactCount: 3 });
  expect(fixture.runs[0]).toEqual({
    params: [GROUP.display_name, GROUP.created_at, GROUP.created_at, GROUP.group_id],
    sql: expect.stringContaining('UPDATE main.sync_groups')
  });
});

it('still rejects an incoming group id even when its Device facts are valid', async () => {
  const fixture = port({ incomingGroup: { ...GROUP, group_id: 'group-other' } });
  await expect(applySyncPackGroupFactsWithDbPort(fixture.value, {
    sourcePeerId: fixture.source.device_identity_key
  })).rejects.toThrow('sync_group_identity_mismatch');
});
