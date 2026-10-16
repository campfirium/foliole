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
import { registerWorkspaceAttachmentResources } from '../../../runtime/workspaceAttachmentResourceRegistry';
import { getIosCompanionDatabaseOwner } from '../../runtime/iosCompanionDatabaseBootstrap';

import { loadIosCompanionWorkspaceSnapshot } from './iosCompanionWorkspaceSnapshotStore';

const META = ANDROID_COMPANION_SYNC_PROTOCOL_DEFINITIONS.syncMetaKeys;

export async function loadIosCompanionWorkspaceSyncState(
  manager?: CompanionSqliteConnectionManager
) {
  return manager ? withConnection(manager, loadState) : getIosCompanionDatabaseOwner().read(loadState);
}

export type CompanionSyncMetadata = Omit<NativeCompanionWorkspaceSyncState, 'workspace_snapshot'>;

const metadataKeys = {
  endpoint_url: META.endpointUrl,
  last_synced_at: META.lastSyncedAt,
  sync_onboarding_status: META.onboardingStatus,
  remembered_targets: META.rememberedTargets,
  sync_events: META.events
} satisfies Record<keyof CompanionSyncMetadata, string>;

export async function updateIosCompanionWorkspaceSyncMetadata(
  update: (current: CompanionSyncMetadata) => Partial<CompanionSyncMetadata>,
  manager?: CompanionSqliteConnectionManager
) {
  const save = (connection: DbPort) => connection.transaction(async tx => {
    const current = await loadMetadata(tx);
    const patch = update(current);
    const now = new Date().toISOString();
    for (const field of Object.keys(metadataKeys) as Array<keyof CompanionSyncMetadata>) {
      if (!(field in patch)) continue;
      const value = patch[field];
      if (value === undefined || JSON.stringify(value) === JSON.stringify(current[field])) continue;
      await writeMeta(tx, metadataKeys[field], Array.isArray(value) ? JSON.stringify(value) : value, now);
    }
    return { ...current, ...patch };
  });
  return manager ? withConnection(manager, save) : getIosCompanionDatabaseOwner().runWriter(save);
}

async function loadState(connection: DbPort) {
  const metadata = await loadMetadata(connection);
  const workspace_snapshot = await loadIosCompanionWorkspaceSnapshot(connection);
  registerWorkspaceAttachmentResources(workspace_snapshot);
  return normalizeWorkspaceSyncState({ ...metadata, workspace_snapshot });
}

async function loadMetadata(connection: DbPort): Promise<CompanionSyncMetadata> {
  const rows = await connection.query(
    `SELECT key, value FROM companion_meta WHERE key IN (?, ?, ?, ?, ?)`,
    [META.endpointUrl, META.events, META.lastSyncedAt, META.onboardingStatus, META.rememberedTargets]
  );
  const values = Object.fromEntries(rows.map((row) => [row.key, row.value]));
  const state = normalizeWorkspaceSyncState({
    endpoint_url: stringOrNull(values[META.endpointUrl]),
    last_synced_at: stringOrNull(values[META.lastSyncedAt]),
    remembered_targets: parseJson(values[META.rememberedTargets], []),
    sync_events: parseJson(values[META.events], []),
    sync_onboarding_status: stringOrNull(values[META.onboardingStatus]),
    workspace_snapshot: null
  });
  return { endpoint_url: state.endpoint_url, last_synced_at: state.last_synced_at,
    remembered_targets: state.remembered_targets, sync_events: state.sync_events,
    sync_onboarding_status: state.sync_onboarding_status };
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
