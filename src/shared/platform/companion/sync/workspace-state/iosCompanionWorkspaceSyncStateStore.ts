import { CapacitorSQLite, SQLiteConnection } from '@capacitor-community/sqlite';

import { ANDROID_COMPANION_SYNC_PROTOCOL_DEFINITIONS } from '../../../../../../lib/core/database/androidCompanionSyncProtocolDefinitions';
import type { NativeCompanionWorkspaceSyncState } from '../../../../../../lib/platform/nativeCompanionSyncContract';
import {
  closeCompanionDatabaseConnection,
  type CompanionSqliteConnectionManager,
  openCompanionDatabaseConnection
} from '../../../companionSyncNodeVersions';
import { normalizeWorkspaceSyncState } from '../../../companionWorkspaceSyncState';

import { loadIosCompanionWorkspaceSnapshot } from './iosCompanionWorkspaceSnapshotStore';

const META = ANDROID_COMPANION_SYNC_PROTOCOL_DEFINITIONS.syncMetaKeys;

export async function loadIosCompanionWorkspaceSyncState(
  manager: CompanionSqliteConnectionManager = new SQLiteConnection(CapacitorSQLite)
) {
  return withConnection(manager, loadState);
}

export async function saveIosCompanionWorkspaceSyncState(
  state: NativeCompanionWorkspaceSyncState,
  manager: CompanionSqliteConnectionManager = new SQLiteConnection(CapacitorSQLite)
) {
  return withConnection(manager, async (connection) => {
    const now = new Date().toISOString();
    await connection.beginTransaction();
    try {
      await writeMeta(connection, META.endpointUrl, state.endpoint_url, now);
      await writeMeta(connection, META.lastSyncedAt, state.last_synced_at, now);
      await writeMeta(connection, META.onboardingStatus, state.sync_onboarding_status, now);
      await writeMeta(connection, META.rememberedTargets, JSON.stringify(state.remembered_targets), now);
      await writeMeta(connection, META.events, JSON.stringify(state.sync_events), now);
      await connection.commitTransaction();
    } catch (error) {
      await connection.rollbackTransaction().catch(() => undefined);
      throw error;
    }
    return loadState(connection);
  });
}

async function loadState(connection: Awaited<ReturnType<typeof openCompanionDatabaseConnection>>) {
  const result = await connection.query(
    `SELECT key, value FROM companion_meta WHERE key IN (?, ?, ?, ?, ?)`,
    [META.endpointUrl, META.events, META.lastSyncedAt, META.onboardingStatus, META.rememberedTargets]
  );
  const values = Object.fromEntries((result.values ?? []).map((row) => [row.key, row.value]));
  return normalizeWorkspaceSyncState({
    endpoint_url: stringOrNull(values[META.endpointUrl]),
    last_synced_at: stringOrNull(values[META.lastSyncedAt]),
    remembered_targets: parseJson(values[META.rememberedTargets], []),
    sync_events: parseJson(values[META.events], []),
    sync_onboarding_status: stringOrNull(values[META.onboardingStatus]),
    workspace_snapshot: await loadIosCompanionWorkspaceSnapshot(connection)
  });
}

async function writeMeta(
  connection: Awaited<ReturnType<typeof openCompanionDatabaseConnection>>,
  key: string,
  value: string | null,
  now: string
) {
  if (value === null) {
    await connection.run('DELETE FROM companion_meta WHERE key = ?', [key], false);
    return;
  }
  await connection.run(
    `INSERT INTO companion_meta (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    [key, value, now],
    false
  );
}

async function withConnection<T>(
  manager: CompanionSqliteConnectionManager,
  operation: (connection: Awaited<ReturnType<typeof openCompanionDatabaseConnection>>) => Promise<T>
) {
  const connection = await openCompanionDatabaseConnection(manager);
  try {
    return await operation(connection);
  } finally {
    await closeCompanionDatabaseConnection(manager, connection);
  }
}

function parseJson(value: unknown, fallback: unknown) {
  if (typeof value !== 'string' || !value) return fallback;
  try { return JSON.parse(value) as unknown; } catch { return fallback; }
}

function stringOrNull(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}
