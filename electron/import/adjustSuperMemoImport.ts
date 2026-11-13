import { IMPORTED_REVIEW_OP_PREFIX } from '../../lib/core/database/initialReviewSchedule.js';
import { recomputeNodeReview } from '../../lib/core/database/reviewProjection.js';
import { adjustSuperMemoDue } from '../../lib/core/import/superMemoScheduleOffset.js';
import { openDatabaseConnection } from '../database/connection.js';

import { superMemoDueInstant } from './superMemoImportSchedule.js';

interface Entry {
  outcome: string;
  nodeId: string | null;
  lastApplied: string | null;
  lastAppliedAt: string | null;
  appliedPercent?: number;
  fullOffset: number | null;
}

interface Batch {
  percent: number;
  entries: Entry[];
  imported: number;
  skipped: number;
  unresolvedImages: number;
}

const ELIGIBLE = `SELECT 1 FROM nodes n JOIN node_review r ON r.node_id = n.id
  WHERE n.id = ? AND n.deleted_at IS NULL AND n.initial_review_due = ? AND r.due = ?
  AND NOT EXISTS (SELECT 1 FROM review_log l WHERE l.node_id = n.id AND
    (l.kind <> 'review' OR substr(l.op_id, 1, ?) <> ?))`;

export function adjustSuperMemoImport(batchId: string, percent: number, previewOnly = false) {
  const { driver } = openDatabaseConnection();
  const key = `supermemo-import:${batchId}`;
  return driver.transaction(() => {
    const row = driver.queryOne<{ value: string }>('SELECT value FROM workspace_meta WHERE key = ?', [key]);
    if (!row) throw new Error('supermemo_import_batch_missing');
    const batch = JSON.parse(row.value) as Batch;
    const now = new Date().toISOString();
    let updated = 0;
    let protectedItems = 0;
    for (const entry of batch.entries) {
      if (entry.outcome !== 'item' || !entry.nodeId || !entry.lastApplied || !entry.lastAppliedAt || entry.fullOffset === null) continue;
      const date = adjustSuperMemoDue(entry.lastApplied, entry.fullOffset, entry.appliedPercent ?? batch.percent, percent);
      if (date === entry.lastApplied) {
        entry.appliedPercent = percent;
        continue;
      }
      const eligible = driver.queryOne(ELIGIBLE, [entry.nodeId, entry.lastAppliedAt, entry.lastAppliedAt,
        IMPORTED_REVIEW_OP_PREFIX.length, IMPORTED_REVIEW_OP_PREFIX]);
      if (!eligible) {
        entry.appliedPercent ??= batch.percent;
        protectedItems++;
        continue;
      }
      updated++;
      if (previewOnly) continue;
      entry.lastApplied = date;
      entry.lastAppliedAt = superMemoDueInstant(date);
      entry.appliedPercent = percent;
      driver.execute('UPDATE nodes SET initial_review_due = ?, sync_dirty = 1, updated_at = ? WHERE id = ?',
        [entry.lastAppliedAt, now, entry.nodeId]);
      recomputeNodeReview(driver, entry.nodeId);
    }
    batch.percent = percent;
    if (!previewOnly) {
      driver.execute('UPDATE workspace_meta SET value = ?, updated_at = ? WHERE key = ?', [JSON.stringify(batch), now, key]);
    }
    return { batchId, percent, updated, protectedItems };
  });
}

export function listSuperMemoImports() {
  const { driver } = openDatabaseConnection();
  return driver.queryAll<{ key: string; value: string }>(
    "SELECT key, value FROM workspace_meta WHERE key GLOB 'supermemo-import:*' ORDER BY updated_at DESC"
  ).map(row => {
    const { percent, imported, skipped, unresolvedImages } = JSON.parse(row.value) as Batch;
    return { batchId: row.key.slice('supermemo-import:'.length), percent, imported, skipped, unresolvedImages };
  });
}
