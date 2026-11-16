import type { DatabaseDriver } from '../../lib/core/database/driver.js';
import { superMemoFullOffset } from '../../lib/core/import/superMemoScheduleOffset.js';
import { blendSuperMemoDue } from '../../lib/core/import/superMemoSchedulePreview.js';
import { calendarDateKey } from '../../lib/core/review/reviewCalendarDates.js';
import type { NativeSuperMemoFirstReviewChange, NativeSuperMemoPreviewRow } from '../../lib/platform/nativeSuperMemoImportContract.js';

import { canUpdateSuperMemoFirstReview, writeSuperMemoFirstReview } from './superMemoFirstReviewWrites.js';
import { superMemoDueInstant } from './superMemoImportSchedule.js';

export interface SuperMemoFirstReviewReceipt {
  id: number;
  nodeId: string | null;
  outcome: string;
  lastApplied?: string | null;
  lastAppliedAt?: string | null;
  appliedPercent?: number;
  fullOffset?: number | null;
}

type FirstReviewWrite = {
  entry: SuperMemoFirstReviewReceipt; nodeId: string; day: string; instant: string; offset: number | null; percent: number;
};

export function planSuperMemoFirstReviewUpdates(driver: DatabaseDriver, entries: SuperMemoFirstReviewReceipt[],
  rows: NativeSuperMemoPreviewRow[], batchPercent: number) {
  const rowsById = new Map(rows.map(row => [row.id, row]));
  const changes: NativeSuperMemoFirstReviewChange[] = [];
  const writes: FirstReviewWrite[] = [];
  for (const entry of entries) {
    const { nodeId, lastApplied, lastAppliedAt } = entry;
    const row = rowsById.get(entry.id);
    if (!nodeId || entry.outcome !== 'item' || row?.outcome !== 'item' || !lastApplied || !lastAppliedAt) continue;
    const percent = entry.appliedPercent ?? batchPercent;
    const day = row.issue || row.sourceState === 'pending' || row.sourceState === 'dismissed'
      ? null : blendSuperMemoDue(row.sourceDue, row.recalculatedDue, percent);
    const offset = superMemoFullOffset(row.sourceDue, row.recalculatedDue);
    if (day === lastApplied && offset === (entry.fullOffset ?? null)) continue;
    const status = !day ? 'unavailable'
      : !canUpdateSuperMemoFirstReview(driver, nodeId, lastAppliedAt) ? 'protected'
      : day === lastApplied ? 'basis' : 'update';
    const current = status === 'protected'
      ? driver.queryOne<{ due: string | null }>('SELECT due FROM node_review WHERE node_id = ?', [nodeId])?.due : null;
    changes.push({ sourceId: entry.id, title: row.title, from: current ? calendarDateKey(new Date(current)) : lastApplied, to: day, status });
    if (!day || (status !== 'update' && status !== 'basis')) continue;
    writes.push({ entry, nodeId, day, instant: day === lastApplied ? lastAppliedAt : superMemoDueInstant(day), offset, percent });
  }
  return { changes, writes };
}

export function applySuperMemoFirstReviewUpdates(driver: DatabaseDriver, writes: FirstReviewWrite[], now: string) {
  for (const { entry, nodeId, day, instant, offset, percent } of writes) {
    if (!entry.lastAppliedAt || !canUpdateSuperMemoFirstReview(driver, nodeId, entry.lastAppliedAt)) {
      throw new Error('supermemo_update_changed');
    }
    if (entry.lastAppliedAt !== instant) writeSuperMemoFirstReview(driver, nodeId, instant, now);
    entry.lastApplied = day;
    entry.lastAppliedAt = instant;
    entry.fullOffset = offset;
    entry.appliedPercent = percent;
  }
}
