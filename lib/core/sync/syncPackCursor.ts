import type { DbPort, DbRow } from './dbPort.js';

export interface SyncPackCursor {
  frontierStateSeq: number;
  fromStateSeq: number;
  restoreId?: string;
  sourceEpoch: string;
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
    frontier_state_seq?: unknown; from_state_seq?: unknown; restore_id?: unknown;
    source_epoch?: unknown; to_state_seq?: unknown
  };
  if (manifest.restore_id !== undefined &&
      (typeof manifest.restore_id !== 'string' || !manifest.restore_id.trim())) {
    throw new Error('invalid_sync_pack_manifest');
  }
  const fromStateSeq = normalizeSeq(manifest.from_state_seq);
  const toStateSeq = normalizeSeq(manifest.to_state_seq);
  const frontierStateSeq = normalizeSeq(manifest.frontier_state_seq);
  if (typeof manifest.source_epoch !== 'string' || !manifest.source_epoch.trim() ||
      toStateSeq < fromStateSeq || frontierStateSeq < toStateSeq) {
    throw new Error('invalid_sync_pack_manifest');
  }
  return {
    frontierStateSeq,
    fromStateSeq,
    ...(manifest.restore_id ? { restoreId: manifest.restore_id as string } : {}),
    sourceEpoch: manifest.source_epoch.trim(),
    toStateSeq
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
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new Error('invalid_sync_pack_manifest');
  }
  return value;
}
