import { COMPANION_SYNCBACK_HOST_CONTRACT as CONTRACT } from '../../../../../../lib/core/database/companionSyncbackHostContractDefinitions';
import type { DbPort, DbRow } from '../../../../../../lib/core/sync/dbPort';
import type { NativeSyncChangeCursor } from '../../../../../../lib/platform/nativeSyncContract';

export async function loadNumberCursor(port: DbPort, key: string) {
  const raw = await loadMeta(port, key);
  if (raw === null) return null;
  const cursor = Number(raw);
  if (!Number.isSafeInteger(cursor) || cursor < 0) throw new Error('invalid_companion_state_push_cursor');
  return cursor;
}

export async function loadChangeCursor(port: DbPort, key: string, stream: 'node_version' | 'review_log') {
  const raw = await loadMeta(port, key);
  if (raw === null) return null;
  try {
    const cursor = JSON.parse(raw) as Partial<NativeSyncChangeCursor>;
    if (typeof cursor.created_at === 'string' && typeof cursor.change_id === 'string') {
      return { change_id: cursor.change_id, created_at: cursor.created_at };
    }
  } catch { /* invalid cursor handled below */ }
  throw new Error(`invalid_companion_${stream}_push_cursor`);
}

export async function saveNumberCursor(port: DbPort, key: string, cursor: number | null) {
  if (cursor !== null && (!Number.isSafeInteger(cursor) || cursor < 0)) {
    throw new Error('invalid_companion_state_push_cursor');
  }
  await saveMeta(port, key, cursor === null ? null : String(cursor));
  return cursor;
}

export async function saveChangeCursor(
  port: DbPort,
  key: string,
  cursor: NativeSyncChangeCursor | null,
  stream: 'node_version' | 'review_log'
) {
  if (cursor && (!cursor.created_at.trim() || !cursor.change_id.trim())) {
    throw new Error(`invalid_companion_${stream}_push_cursor`);
  }
  await saveMeta(port, key, cursor === null ? null : JSON.stringify(cursor));
  return cursor;
}

export async function loadRequiredMeta(port: DbPort, key: string) {
  const value = await loadMeta(port, key);
  if (!value) throw new Error(`missing_companion_meta:${key}`);
  return value;
}

async function loadMeta(port: DbPort, key: string) {
  const row = (await port.query<DbRow>(CONTRACT.sql.metaQuery, [key]))[0];
  return typeof row?.value === 'string' && row.value.length > 0 ? row.value : null;
}

async function saveMeta(port: DbPort, key: string, value: string | null) {
  if (value === null) {
    await port.run(CONTRACT.sql.metaDelete, [key]);
    return;
  }
  await port.run(CONTRACT.sql.metaUpsert, [key, value, new Date().toISOString()]);
}
