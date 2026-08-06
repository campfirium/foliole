import { ANDROID_COMPANION_SYNC_PROTOCOL_DEFINITIONS } from '../../../../../../lib/core/database/androidCompanionSyncProtocolDefinitions';
import type { DbPort } from '../../../../../../lib/core/sync/dbPort';
import type { NativeCompanionWorkspaceSyncState } from '../../../../../../lib/platform/nativeCompanionSyncContract';
import { createCapacitorSqliteDbPort } from '../../../capacitorSqliteDbPort';
import {
  closeCompanionDatabaseConnection,
  type CompanionSqliteConnectionManager,
  openCompanionDatabaseConnection
} from '../../../companionSyncNodeVersions';
import { normalizeWorkspaceSyncState } from '../../../companionWorkspaceSyncState';
import { getIosCompanionDatabaseOwner } from '../../runtime/iosCompanionDatabaseBootstrap';

import { loadIosCompanionWorkspaceSnapshot } from './iosCompanionWorkspaceSnapshotStore';

const META = ANDROID_COMPANION_SYNC_PROTOCOL_DEFINITIONS.syncMetaKeys;

export async function loadIosCompanionWorkspaceSyncState(
  manager?: CompanionSqliteConnectionManager
) {
  return manager ? withConnection(manager, loadState) : getIosCompanionDatabaseOwner().read(loadState);
}

export async function saveIosCompanionWorkspaceSyncState(
  state: NativeCompanionWorkspaceSyncState,
  manager?: CompanionSqliteConnectionManager
) {
  const save = async (connection: DbPort) => {
    const now = new Date().toISOString();
    await connection.transaction(async (tx) => {
      await writeMeta(tx, META.endpointUrl, state.endpoint_url, now);
      await writeMeta(tx, META.lastSyncedAt, state.last_synced_at, now);
      await writeMeta(tx, META.onboardingStatus, state.sync_onboarding_status, now);
      await writeMeta(tx, META.rememberedTargets, JSON.stringify(state.remembered_targets), now);
      await writeMeta(tx, META.events, JSON.stringify(state.sync_events), now);
    });
    return loadState(connection);
  };
  return manager ? withConnection(manager, save) : getIosCompanionDatabaseOwner().runWriter(save);
}

async function loadState(connection: DbPort) {
  const rows = await connection.query(
    `SELECT key, value FROM companion_meta WHERE key IN (?, ?, ?, ?, ?)`,
    [META.endpointUrl, META.events, META.lastSyncedAt, META.onboardingStatus, META.rememberedTargets]
  );
  const values = Object.fromEntries(rows.map((row) => [row.key, row.value]));
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
  connection: DbPort,
  key: string,
  value: string | null,
  now: string
) {
  if (value === null) {
    await connection.run('DELETE FROM companion_meta WHERE key = ?', [key]);
    return;
  }
  await connection.run(
    `INSERT INTO companion_meta (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    [key, value, now],
  );
}

async function withConnection<T>(
  manager: CompanionSqliteConnectionManager,
  operation: (connection: DbPort) => Promise<T>
) {
  const connection = await openCompanionDatabaseConnection(manager);
  try {
    return await operation(createCapacitorSqliteDbPort(connection, 'ios'));
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
