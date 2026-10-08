import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../companionWorkspaceRuntimeRepository', () => ({ FolioleCompanionSync: {
  configureFramedSyncPayloadBudget: vi.fn(async () => undefined),
  closeFramedSyncPayloadBudget: vi.fn(async () => undefined),
  maintainAttachmentFiles: vi.fn(async () => ({ files: [] }))
} }));

import { ANDROID_COMPANION_MIGRATION_PLAN } from '../../../../../lib/core/database/androidCompanionMigrationSchemaStatements';
import {
  COMPANION_DATABASE_VERSION,
  COMPANION_TEXT_BODY_OWNERSHIP_VERSION,
  type NativeCompanionBootstrapPayload
} from '../../../../../lib/platform/nativeCompanionContract';
import { FolioleCompanionSync } from '../../companionWorkspaceRuntimeRepository';

import {
  closeIosCompanionDatabase, getIosCompanionDatabaseOwner,
  initializeIosCompanionDatabase, type IosCompanionDatabaseManager
} from './iosCompanionDatabaseBootstrap';

afterEach(() => closeIosCompanionDatabase());

function nativeState(): NativeCompanionBootstrapPayload {
  return {
    booted_at: '2026-07-19T08:00:00Z',
    database_path: null,
    database_ready: false,
    host_name: 'iPhone',
    runtime_kind: 'ios-capacitor'
  };
}

function harness(args: { existed?: boolean; path?: string; storedId?: string; version?: number } = {}) {
  const meta = new Map<string, string>();
  if (args.storedId) meta.set('device_id', args.storedId);
  const connection = {
    beginTransaction: vi.fn(async () => ({ changes: { changes: 0 } })),
    commitTransaction: vi.fn(async () => ({ changes: { changes: 0 } })),
    execute: vi.fn(async () => ({ changes: { changes: 0 } })),
    getUrl: vi.fn(async () => args.path === '' ? {} : ({
      url: args.path ?? 'file:///Library/CapacitorDatabase/foliole-companionSQLite.db'
    })),
    isDBOpen: vi.fn(async () => ({ result: false })),
    open: vi.fn(async () => undefined),
    query: vi.fn(async (sql: string, values: unknown[] = []) => queryResult(sql, args, meta, values)),
    rollbackTransaction: vi.fn(async () => ({ changes: { changes: 0 } })),
    run: vi.fn(async (sql: string, values: unknown[] = []) => {
      updateMeta(sql, values, meta);
      return { changes: { changes: 1 } };
    })
  };
  const manager = {
    closeConnection: vi.fn(async () => undefined),
    createConnection: vi.fn(async () => connection),
    isConnection: vi.fn(async () => ({ result: false })),
    isDatabase: vi.fn(async () => ({ result: args.existed ?? false })),
    retrieveConnection: vi.fn(async () => connection)
  } as unknown as IosCompanionDatabaseManager;
  return { connection, manager };
}

function queryResult(
  sql: string,
  args: { existed?: boolean; version?: number },
  meta: Map<string, string>,
  values: unknown[]
) {
  if (sql === 'PRAGMA quick_check') return { values: [{ quick_check: 'ok' }] };
  if (sql === 'PRAGMA journal_mode') return { values: [{ journal_mode: 'delete' }] };
  if (sql === 'PRAGMA user_version') return { values: [{ user_version: args.version ?? 0 }] };
  if (sql.includes("name = 'companion_meta'")) return { values: args.existed ? [{ present: 1 }] : [] };
  if (sql.includes('FROM companion_meta WHERE key = ?')) {
    const value = meta.get(String(values[0]));
    return { values: value ? [{ value }] : [] };
  }
  if (sql.includes('pragma_table_info')) return { values: [{ name: 'present' }] };
  return { values: [] };
}

function updateMeta(sql: string, values: unknown[], meta: Map<string, string>) {
  if (sql.includes('DELETE FROM companion_meta')) {
    if (meta.get('device_identity_reset_pending') === String(values[0])) {
      meta.delete('device_identity_reset_pending');
    }
    return;
  }
  if (sql.includes("VALUES ('device_id', ?, ?)")) meta.set('device_id', String(values[0]));
  else if (sql.includes("VALUES ('device_identity_reset_pending', ?, ?)")) {
    meta.set('device_identity_reset_pending', String(values[0]));
  } else if (sql.includes('INSERT INTO companion_meta')) {
    meta.set(String(values[0]), String(values[1]));
  }
}

describe('iosCompanionDatabaseBootstrap version contract', () => {
  it('tracks the latest shared companion migration independently of the desktop schema', () => {
    expect(COMPANION_DATABASE_VERSION).toBe(
      Math.max(COMPANION_TEXT_BODY_OWNERSHIP_VERSION,
        ...ANDROID_COMPANION_MIGRATION_PLAN.map((migration) => migration.beforeVersion))
    );
  });
});

describe('iosCompanionDatabaseBootstrap', () => {
  it('creates a fresh database through the shared lifecycle transaction', async () => {
    const { connection, manager } = harness();
    const result = await initializeIosCompanionDatabase(nativeState(), manager);

    expect(result).toMatchObject({
      database_path: '/Library/CapacitorDatabase/foliole-companionSQLite.db',
      database_ready: true,
      device_id: 'iPhone',
      host_name: 'iPhone'
    });
    expect(manager.createConnection).toHaveBeenCalledWith(
      'foliole-companion', false, 'no-encryption', COMPANION_DATABASE_VERSION, false
    );
    expect(FolioleCompanionSync.configureFramedSyncPayloadBudget).toHaveBeenLastCalledWith({
      library_key: result.database_path, generation_id: expect.any(String)
    });
    expect(connection.query).toHaveBeenCalledWith('PRAGMA busy_timeout = 5000', []);
    expect(connection.beginTransaction).toHaveBeenCalledTimes(1);
    expect(connection.commitTransaction).toHaveBeenCalledTimes(1);
    expect(connection.run).toHaveBeenCalledWith(
      expect.stringContaining('INSERT OR REPLACE INTO companion_meta'),
      ['device_id', 'iPhone', '2026-07-19T08:00:00Z'],
      false
    );
  });

  it('hydrates and validates the permanent identity from an existing database', async () => {
    const { connection, manager } = harness({ existed: true, storedId: 'ios-device', version: 21 });
    const result = await initializeIosCompanionDatabase(nativeState(), manager);

    expect(result.device_id).toBe('ios-device');
    expect(connection.run).not.toHaveBeenCalledWith(expect.stringContaining('INSERT INTO companion_meta'), expect.anything(), false);
    expect(connection.commitTransaction).toHaveBeenCalledTimes(1);
  });
});

it('closes native grants before queued database reads finish and the connection closes', async () => {
  const { manager } = harness();
  await initializeIosCompanionDatabase(nativeState(), manager);
  const owner = getIosCompanionDatabaseOwner();
  let finishRead!: () => void;
  let readStarted!: () => void;
  const started = new Promise<void>((resolve) => { readStarted = resolve; });
  const pending = owner.read(async () => {
    readStarted();
    await new Promise<void>((resolve) => { finishRead = resolve; });
  });
  await started;
  const closeCount = vi.mocked(FolioleCompanionSync.closeFramedSyncPayloadBudget).mock.calls.length;
  const closing = closeIosCompanionDatabase();
  await vi.waitFor(() => expect(FolioleCompanionSync.closeFramedSyncPayloadBudget)
    .toHaveBeenCalledTimes(closeCount + 1));
  expect(manager.closeConnection).not.toHaveBeenCalled();
  finishRead();
  await Promise.all([pending, closing]);
  expect(manager.closeConnection).toHaveBeenCalledOnce();
});

it('drains the previous owner before opening a new generation of the same library', async () => {
  const first = harness();
  await initializeIosCompanionDatabase(nativeState(), first.manager);
  const identity = vi.mocked(FolioleCompanionSync.configureFramedSyncPayloadBudget).mock.calls.at(-1)![0];
  const second = harness();
  await initializeIosCompanionDatabase(nativeState(), second.manager);
  const next = vi.mocked(FolioleCompanionSync.configureFramedSyncPayloadBudget).mock.calls.at(-1)![0];
  expect(FolioleCompanionSync.closeFramedSyncPayloadBudget).toHaveBeenLastCalledWith(identity);
  expect(first.manager.closeConnection).toHaveBeenCalledOnce();
  expect(next.library_key).toBe(identity.library_key);
  expect(next.generation_id).not.toBe(identity.generation_id);
});

describe('iosCompanionDatabaseBootstrap host profile migration', () => {
  it('transfers permanent state without changing the frozen execution identity', async () => {
    const { connection, manager } = harness({ existed: true, storedId: 'different-device', version: 21 });

    await expect(initializeIosCompanionDatabase(nativeState(), manager))
      .resolves.toMatchObject({ device_id: 'different-device', host_name: 'iPhone' });
    expect(connection.beginTransaction).toHaveBeenCalledOnce();
    expect(connection.run).not.toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM sync_group_local_state'), expect.anything(), false
    );
  });
});

describe('iosCompanionDatabaseBootstrap failure boundaries', () => {
  it('blocks a newer database before any write', async () => {
    const { connection, manager } = harness({
      existed: true, storedId: 'ios-device', version: COMPANION_DATABASE_VERSION + 1
    });

    await expect(initializeIosCompanionDatabase(nativeState(), manager)).rejects.toThrow('newer-version');
    expect(connection.beginTransaction).not.toHaveBeenCalled();
  });

  it('rolls back migration and leaves readiness false when acceptance injection fails', async () => {
    const { connection, manager } = harness({ existed: true, storedId: 'ios-device', version: 18 });

    await expect(initializeIosCompanionDatabase(nativeState(), manager, {
      afterRepair: () => { throw new Error('acceptance upgrade fault'); }
    })).rejects.toThrow('acceptance upgrade fault');
    expect(connection.rollbackTransaction).toHaveBeenCalledTimes(1);
    expect(connection.commitTransaction).not.toHaveBeenCalled();
  });

  it('closes a failed owner when the plugin returns no database path', async () => {
    const { manager } = harness({ path: '' });
    await expect(initializeIosCompanionDatabase(nativeState(), manager)).rejects.toThrow(/did not return a path/i);
    expect(manager.closeConnection).toHaveBeenCalledTimes(1);
  });
});
