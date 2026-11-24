import type { DatabaseDriver } from '../../lib/core/database/driver.js';
import { mapSuperMemoPriority } from '../../lib/core/import/superMemoPriorityMapping.js';
import type { NativeSuperMemoPreviewRow, NativeSuperMemoPriorityChange } from '../../lib/platform/nativeSuperMemoImportContract.js';
import { loadOrCreateDesktopHostName } from '../database/hostProfile.js';

export interface SuperMemoPriorityReceipt {
  id: number;
  nodeId: string | null;
  outcome: string;
  sourceRank?: number | null;
  appliedPriority?: number;
}

type PriorityWrite = { entry: SuperMemoPriorityReceipt; nodeId: string; from: number; to: number };

function legacyRankCount(entries: readonly SuperMemoPriorityReceipt[]) {
  const ranks = entries.flatMap(entry => entry.sourceRank == null ? [] : [entry.sourceRank]).sort((a, b) => a - b);
  return ranks.every((rank, index) => rank === index + 1) ? ranks.length : 0;
}

export function planSuperMemoPriorityUpdates(driver: DatabaseDriver, batchEntries: SuperMemoPriorityReceipt[],
  entries: SuperMemoPriorityReceipt[], rows: NativeSuperMemoPreviewRow[], boundaries: readonly number[]) {
  const rankCount = legacyRankCount(batchEntries);
  const rowsById = new Map(rows.map(row => [row.id, row]));
  const changes: NativeSuperMemoPriorityChange[] = [];
  const writes: PriorityWrite[] = [];
  for (const entry of entries) {
    const row = rowsById.get(entry.id);
    const { nodeId, sourceRank } = entry;
    if (!nodeId || !row || row.sourcePriorityPercent == null || row.outcome !== entry.outcome) continue;
    const live = driver.queryOne<{ title: string; priority: number | null }>(
      'SELECT title, priority FROM nodes WHERE id = ? AND kind = ? AND deleted_at IS NULL AND virtual_filter IS NULL',
      [nodeId, entry.outcome]);
    const to = mapSuperMemoPriority(row.sourcePriorityPercent, boundaries);
    if (!live || live.priority === to) continue;
    // Older imports only stored the one-based queue rank.
    const legacy = sourceRank === null ? 5 : sourceRank !== undefined && rankCount
      ? 1 + Math.floor((sourceRank - 1) * 9 / rankCount) : undefined;
    const from = live.priority;
    const canWrite = from !== null && from === (entry.appliedPriority ?? legacy);
    changes.push({ sourceId: entry.id, title: live.title, from, to, status: canWrite ? 'update' : 'protected' });
    if (canWrite) writes.push({ entry, nodeId, from, to });
  }
  return { changes, writes };
}

export function applySuperMemoPriorityUpdates(driver: DatabaseDriver, writes: PriorityWrite[], now: string) {
  if (!writes.length) return;
  const hostName = loadOrCreateDesktopHostName(now);
  for (const { entry, nodeId, from, to } of writes) {
    const result = driver.execute(
      'UPDATE nodes SET priority = ?, updated_at = ?, last_modified_by_host_name = ?, sync_dirty = 1 WHERE id = ? AND priority = ? AND deleted_at IS NULL',
      [to, now, hostName, nodeId, from]);
    if (result.changes !== 1) throw new Error('supermemo_update_changed');
    entry.appliedPriority = to;
  }
}
