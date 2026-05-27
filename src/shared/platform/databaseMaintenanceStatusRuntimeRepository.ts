import { NATIVE_COMMANDS } from '../../../lib/platform/nativeCommands';

import { getRuntimeInvoke } from './runtimeInvoke';
import { logRuntimeWarning } from './runtimeLogging';

export type RuntimeDatabaseMaintenanceKey = 'main-data' | 'search-data' | 'external-sources-data';
export type RuntimeDatabaseMaintenanceState = 'present' | 'absent' | 'unreadable';
export type RuntimeDatabaseMaintenanceBackupRole = 'included' | 'excluded';
export type RuntimeDatabaseMaintenanceRebuildRole =
  | 'not-applicable'
  | 'rebuildable-from-main-data';

export interface RuntimeDatabaseMaintenanceEntry {
  backupRole: RuntimeDatabaseMaintenanceBackupRole;
  key: RuntimeDatabaseMaintenanceKey;
  rebuildRole: RuntimeDatabaseMaintenanceRebuildRole;
  sizeBytes: number | null;
  state: RuntimeDatabaseMaintenanceState;
}

export interface RuntimeDatabaseMaintenanceStatus {
  entries: RuntimeDatabaseMaintenanceEntry[];
  updatedAt: string;
}

const DATABASE_MAINTENANCE_KEYS = new Set<RuntimeDatabaseMaintenanceKey>([
  'main-data',
  'search-data',
  'external-sources-data'
]);
const DATABASE_MAINTENANCE_STATES = new Set<RuntimeDatabaseMaintenanceState>([
  'present',
  'absent',
  'unreadable'
]);
const DATABASE_MAINTENANCE_BACKUP_ROLES = new Set<RuntimeDatabaseMaintenanceBackupRole>([
  'included',
  'excluded'
]);
const DATABASE_MAINTENANCE_REBUILD_ROLES = new Set<RuntimeDatabaseMaintenanceRebuildRole>([
  'not-applicable',
  'rebuildable-from-main-data'
]);

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isFiniteNonNegativeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function toRuntimeDatabaseMaintenanceEntry(payload: unknown): RuntimeDatabaseMaintenanceEntry | null {
  if (!isObjectRecord(payload)) return null;
  const key = payload.key;
  const state = payload.state;
  const backupRole = payload.backup_role;
  const rebuildRole = payload.rebuild_role;
  if (
    !DATABASE_MAINTENANCE_KEYS.has(key as RuntimeDatabaseMaintenanceKey) ||
    !DATABASE_MAINTENANCE_STATES.has(state as RuntimeDatabaseMaintenanceState) ||
    !DATABASE_MAINTENANCE_BACKUP_ROLES.has(backupRole as RuntimeDatabaseMaintenanceBackupRole) ||
    !DATABASE_MAINTENANCE_REBUILD_ROLES.has(rebuildRole as RuntimeDatabaseMaintenanceRebuildRole)
  ) {
    return null;
  }
  const sizeBytes = payload.size_bytes;
  if (sizeBytes !== null && !isFiniteNonNegativeNumber(sizeBytes)) return null;
  if (state === 'unreadable' && sizeBytes !== null) return null;
  if (state !== 'unreadable' && !isFiniteNonNegativeNumber(sizeBytes)) return null;
  return {
    backupRole: backupRole as RuntimeDatabaseMaintenanceBackupRole,
    key: key as RuntimeDatabaseMaintenanceKey,
    rebuildRole: rebuildRole as RuntimeDatabaseMaintenanceRebuildRole,
    sizeBytes,
    state: state as RuntimeDatabaseMaintenanceState
  };
}

function toRuntimeDatabaseMaintenanceStatus(payload: unknown): RuntimeDatabaseMaintenanceStatus | null {
  if (!isObjectRecord(payload) || !Array.isArray(payload.entries) || typeof payload.updated_at !== 'string') {
    return null;
  }
  const entries = payload.entries.map(toRuntimeDatabaseMaintenanceEntry);
  if (entries.some((entry) => entry === null)) return null;
  return {
    entries: entries as RuntimeDatabaseMaintenanceEntry[],
    updatedAt: payload.updated_at
  };
}

export async function loadRuntimeDatabaseMaintenanceStatus(): Promise<RuntimeDatabaseMaintenanceStatus | null> {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) return null;
  try {
    const result = toRuntimeDatabaseMaintenanceStatus(
      await runtimeInvoke(NATIVE_COMMANDS.loadDatabaseMaintenanceStatus)
    );
    if (!result) {
      logRuntimeWarning('native database maintenance payload invalid', {
        action: 'load_runtime_database_maintenance_status',
        area: 'bridge',
        command: NATIVE_COMMANDS.loadDatabaseMaintenanceStatus,
        fallback: 'return_null'
      });
    }
    return result;
  } catch (error) {
    logRuntimeWarning('native database maintenance load failed', {
      action: 'load_runtime_database_maintenance_status',
      area: 'bridge',
      command: NATIVE_COMMANDS.loadDatabaseMaintenanceStatus,
      fallback: 'return_null',
      error
    });
    return null;
  }
}

export const databaseMaintenanceStatusBridgeTestExports = {
  toRuntimeDatabaseMaintenanceStatus
};
