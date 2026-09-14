import { NATIVE_COMMANDS } from '../../../../lib/platform/nativeCommands';
import type {
  NativeBackupSearchMatch,
  NativeBackupSearchNextResult
} from '../../../../lib/platform/nativeContract';
import { getRuntimeInvoke } from '../runtimeInvoke';

function readString(value: unknown) {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function normalizeMatch(value: unknown): NativeBackupSearchMatch | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const payload = value as Record<string, unknown>;
  const backupName = readString(payload.backup_name);
  const backupUpdatedAt = readString(payload.backup_updated_at);
  const content = typeof payload.content === 'string' ? payload.content : null;
  const nodeId = readString(payload.node_id);
  const path = typeof payload.path === 'string' ? payload.path : null;
  const title = readString(payload.title);
  if (!backupName || !backupUpdatedAt || content === null || !nodeId || path === null || !title || typeof payload.deleted !== 'boolean') {
    return null;
  }
  return {
    backup_name: backupName,
    backup_updated_at: backupUpdatedAt,
    content,
    deleted: payload.deleted,
    node_id: nodeId,
    path,
    title
  };
}

function normalizeNextResult(value: unknown): NativeBackupSearchNextResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Backup search returned an invalid response.');
  }
  const payload = value as Record<string, unknown>;
  const skipped = typeof payload.skipped_backup_count === 'number' && Number.isFinite(payload.skipped_backup_count)
    ? Math.max(0, Math.floor(payload.skipped_backup_count))
    : 0;
  if (payload.status === 'complete') return { skipped_backup_count: skipped, status: 'complete' };
  const match = payload.status === 'match' ? normalizeMatch(payload.match) : null;
  if (!match) throw new Error('Backup search returned an invalid match.');
  return { match, skipped_backup_count: skipped, status: 'match' };
}

export async function startDatabaseBackupSearch(query: string) {
  const invoke = getRuntimeInvoke();
  if (!invoke) throw new Error('Backup search is available in the desktop app.');
  const result = await invoke(NATIVE_COMMANDS.startBackupSearch, { query });
  const sessionId = readString(result?.session_id);
  if (!sessionId) throw new Error('Backup search did not create a session.');
  return sessionId;
}

export async function nextDatabaseBackupSearch(sessionId: string) {
  const invoke = getRuntimeInvoke();
  if (!invoke) throw new Error('Backup search is available in the desktop app.');
  return normalizeNextResult(await invoke(NATIVE_COMMANDS.nextBackupSearch, { session_id: sessionId }));
}

export async function cancelDatabaseBackupSearch(sessionId: string) {
  const invoke = getRuntimeInvoke();
  if (invoke) await invoke(NATIVE_COMMANDS.cancelBackupSearch, { session_id: sessionId });
}

export type DatabaseBackupSearchMatch = NativeBackupSearchMatch;
