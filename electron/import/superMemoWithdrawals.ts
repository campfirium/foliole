import type { DatabaseDriver } from '../../lib/core/database/driver.js';
import { IMPORTED_REVIEW_OP_PREFIX } from '../../lib/core/database/initialReviewSchedule.js';
import type { NativeSuperMemoPreviewRow, NativeSuperMemoWithdrawal } from '../../lib/platform/nativeSuperMemoImportContract.js';
import { softDeleteNodes } from '../database/nodeMutations.js';
import { inspectFoliolePublishedDelete } from '../foliolePublish/foliolePublishManagement.js';

interface WithdrawalEntry {
  id: number;
  nodeId: string | null;
  outcome: string;
  lastAppliedAt?: string | null;
  withdrawnAt?: string;
}
type Candidate = { entry: WithdrawalEntry; nodeId: string; change: NativeSuperMemoWithdrawal };

function readWithdrawalTarget(driver: DatabaseDriver, nodeId: string, due: string | null) {
  return driver.queryOne<{ title: string; has_children: number; protected: number }>(`
    SELECT n.title,
      EXISTS(SELECT 1 FROM nodes c WHERE c.parent_id = n.id) AS has_children,
      (n.created_at <> n.updated_at OR n.virtual_filter IS NOT NULL OR n.image_regions IS NOT NULL
        OR (n.kind = 'item' AND (n.initial_review_due IS NOT ? OR EXISTS(
          SELECT 1 FROM node_review r WHERE r.node_id = n.id AND r.due IS NOT ?)))
        OR EXISTS(SELECT 1 FROM review_log l WHERE l.node_id = n.id AND
          (l.kind <> 'review' OR substr(l.op_id, 1, ?) <> ?))
        OR EXISTS(SELECT 1 FROM node_reading_host_state h WHERE h.node_id = n.id AND (h.reading_position <> 0 OR h.updated_at <> n.created_at))
      ) AS protected
    FROM nodes n WHERE n.id = ? AND n.deleted_at IS NULL
  `, [due, due, IMPORTED_REVIEW_OP_PREFIX.length, IMPORTED_REVIEW_OP_PREFIX, nodeId]);
}

export function planSuperMemoWithdrawals(driver: DatabaseDriver, entries: WithdrawalEntry[], rows: NativeSuperMemoPreviewRow[]) {
  const entriesById = new Map(entries.map(entry => [entry.id, entry]));
  const candidates: Candidate[] = [];
  for (const row of rows) {
    if (row.outcome !== 'skipped' || !row.issue || row.issue === 'missing-question' || row.issue === 'missing-answer') continue;
    const entry = entriesById.get(row.id);
    if (!entry?.nodeId || entry.outcome === 'skipped' || entry.withdrawnAt) continue;
    const target = readWithdrawalTarget(driver, entry.nodeId, entry.lastAppliedAt ?? null);
    if (!target) continue;
    const reason = target.has_children ? 'children' : target.protected ? 'modified' : undefined;
    candidates.push({ entry, nodeId: entry.nodeId, change: {
      sourceId: row.id, title: target.title, issue: row.issue, ...(reason ? { protectedBy: reason } : {})
    } });
  }
  const eligibleTopics = candidates.filter(candidate => candidate.entry.outcome === 'topic' && !candidate.change.protectedBy);
  if (eligibleTopics.length) {
    const published = inspectFoliolePublishedDelete(eligibleTopics.map(candidate => candidate.nodeId));
    if (published.status === 'requires_unpublish') {
      const blocked = new Set(published.published_node_ids);
      for (const candidate of eligibleTopics) {
        if (blocked.has(candidate.nodeId)) candidate.change.protectedBy = 'published';
      }
    }
  }
  return candidates;
}

export function selectSuperMemoWithdrawals(candidates: Candidate[], sourceIds: readonly number[]) {
  if (!sourceIds.length) return [];
  const eligible = new Map(candidates.filter(candidate => !candidate.change.protectedBy)
    .map(candidate => [candidate.change.sourceId, candidate]));
  if (new Set(sourceIds).size !== sourceIds.length || sourceIds.some(id => !eligible.has(id))) {
    throw new Error('supermemo_withdrawal_changed');
  }
  return sourceIds.map(id => eligible.get(id)!);
}

export function applySuperMemoWithdrawals(selected: Candidate[], now: string) {
  if (!selected.length) return;
  softDeleteNodes({ nodeIds: selected.map(item => item.nodeId), deletedAt: now });
  for (const { entry } of selected) entry.withdrawnAt = now;
}
