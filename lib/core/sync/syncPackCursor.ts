import type { DbPort, DbRow } from './dbPort.js';

export interface SyncPackCursor {
  fromStateSeq: number;
  restoreId?: string;
  toStateSeq: number;
}

interface ManifestRow extends DbRow {
  value: string;
}

export async function readSyncPackCursorWithDbPort(
  port: DbPort,
  incomingAlias = 'inc'
): Promise<SyncPackCursor> {
  const rows = await port.query<ManifestRow>(
    `SELECT value FROM ${incomingAlias}.pack_manifest WHERE key = 'manifest_json'`
  );
  const value = rows[0]?.value;
  if (!value?.trim()) {
    throw new Error('invalid_sync_pack_manifest');
  }
  const manifest = JSON.parse(value) as {
    from_state_seq?: unknown; restore_id?: unknown; to_state_seq?: unknown
  };
  if (manifest.restore_id !== undefined &&
      (typeof manifest.restore_id !== 'string' || !manifest.restore_id.trim())) {
    throw new Error('invalid_sync_pack_manifest');
  }
  return {
    fromStateSeq: normalizeSeq(manifest.from_state_seq),
    ...(manifest.restore_id ? { restoreId: manifest.restore_id as string } : {}),
    toStateSeq: normalizeSeq(manifest.to_state_seq)
  };
}

export function assertContiguousSyncPackCursor(cursor: SyncPackCursor, currentCursor: number) {
  if (cursor.toStateSeq <= currentCursor) return false;
  if (cursor.fromStateSeq !== currentCursor) {
    throw new Error('sync_pack_cursor_not_contiguous');
  }
  return true;
}

function normalizeSeq(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
}
