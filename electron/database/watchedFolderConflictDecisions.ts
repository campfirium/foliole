import { randomUUID } from 'node:crypto';

import type { DatabaseRow } from '../../lib/core/database/driver.js';
import {
  groupWatchedFolderConflicts,
  parseWatchedFolderConflictDecision,
  type WatchedFolderConflictDecision
} from '../../lib/platform/watchedFolderConflictContract.js';

import { openDatabaseConnection } from './connection.js';
import { loadWatchedFolderGroupSources } from './watchedFolderGroupSources.js';

interface DecisionRow extends DatabaseRow {
  conflict_key: string;
  decided_at: string;
  decided_by_device_identity_key: string;
  decision_id: string;
  group_id: string;
  local_reconciled_at: string | null;
  source_alias_refs_json: string;
  selected_binding_ids_json: string;
}

function groupContext() {
  return openDatabaseConnection().driver.queryOne<{ group_id: string; local_device_identity_key: string }>(
    `SELECT group_id, local_device_identity_key FROM sync_group_local_state
     WHERE singleton_id = 1 AND state = 'active'`
  ) ?? null;
}

function toDecision(row: DecisionRow): WatchedFolderConflictDecision {
  return {
    conflict_key: row.conflict_key,
    decided_at: row.decided_at,
    decided_by_device_identity_key: row.decided_by_device_identity_key,
    decision_id: row.decision_id,
    group_id: row.group_id,
    selected_binding_ids: JSON.parse(row.selected_binding_ids_json) as string[],
    source_alias_refs: JSON.parse(row.source_alias_refs_json) as string[]
  };
}

export function loadWatchedFolderConflictDecisions() {
  const group = groupContext();
  if (!group) return [];
  return openDatabaseConnection().driver.queryAll<DecisionRow>(
    'SELECT * FROM watched_folder_conflict_decisions WHERE group_id = ?', [group.group_id]
  ).map(toDecision);
}

export function loadPendingWatchedFolderConflicts() {
  const decided = new Set(loadWatchedFolderConflictDecisions().map((item) => item.conflict_key));
  return groupWatchedFolderConflicts(loadWatchedFolderGroupSources())
    .filter((conflict) => !decided.has(conflict.conflict_key));
}

export function canRunWatchedFolderConflictSource(bindingId: string) {
  const conflict = groupWatchedFolderConflicts(loadWatchedFolderGroupSources())
    .find((item) => item.sources.some((source) => source.binding_id === bindingId));
  if (!conflict) return true;
  const decision = loadWatchedFolderConflictDecisions()
    .find((item) => item.conflict_key === conflict.conflict_key);
  return Boolean(decision?.selected_binding_ids.includes(bindingId));
}

export function loadUnreconciledWatchedFolderConflictDecisions() {
  const group = groupContext();
  if (!group) return [];
  return openDatabaseConnection().driver.queryAll<DecisionRow>(
    `SELECT * FROM watched_folder_conflict_decisions
     WHERE group_id = ? AND local_reconciled_at IS NULL`, [group.group_id]
  ).map(toDecision);
}

export function markWatchedFolderConflictReconciled(conflictKey: string, now: string) {
  const group = groupContext();
  if (!group) return;
  openDatabaseConnection().driver.execute(
    `UPDATE watched_folder_conflict_decisions SET local_reconciled_at = ?
     WHERE group_id = ? AND conflict_key = ? AND local_reconciled_at IS NULL`,
    [now, group.group_id, conflictKey]
  );
}

export function saveWatchedFolderConflictDecision(conflictKey: string, selectedBindingIds: string[]) {
  const group = groupContext();
  if (!group) throw new Error('sync_group_not_available');
  const conflict = groupWatchedFolderConflicts(loadWatchedFolderGroupSources())
    .find((item) => item.conflict_key === conflictKey);
  if (!conflict || !selectedBindingIds.length ||
      selectedBindingIds.some((id) => !conflict.sources.some((source) => source.binding_id === id))) {
    throw new Error('watched_conflict_selection_invalid');
  }
  const existing = loadWatchedFolderConflictDecisions()
    .find((item) => item.conflict_key === conflictKey);
  if (existing) return existing;
  const decision: WatchedFolderConflictDecision = {
    conflict_key: conflictKey,
    decided_at: new Date().toISOString(),
    decided_by_device_identity_key: group.local_device_identity_key,
    decision_id: `watched-decision-${randomUUID()}`,
    group_id: group.group_id,
    selected_binding_ids: [...new Set(selectedBindingIds)].sort(),
    source_alias_refs: [...new Set(conflict.sources.flatMap((source) => [
      ...(!selectedBindingIds.includes(source.binding_id) ? [source.source_ref] : []),
      ...(source.legacy_rule_id?.startsWith('draft-import-source-')
        ? [`watched:${source.legacy_rule_id}`] : [])
    ]))].sort()
  };
  writeDecision(decision);
  return decision;
}

export function applyRemoteWatchedFolderConflictDecisions(values: unknown[]) {
  const group = groupContext();
  if (!group) throw new Error('sync_group_not_available');
  for (const value of values) {
    const incoming = parseWatchedFolderConflictDecision(value);
    if (incoming.group_id !== group.group_id) throw new Error('watched_decision_group_mismatch');
    const existing = loadWatchedFolderConflictDecisions()
      .find((item) => item.conflict_key === incoming.conflict_key);
    if (!existing || decisionOrder(incoming) < decisionOrder(existing)) writeDecision(incoming);
  }
}

function decisionOrder(value: WatchedFolderConflictDecision) {
  return `${value.decided_at}\u001f${value.decided_by_device_identity_key}\u001f${value.decision_id}`;
}

function writeDecision(value: WatchedFolderConflictDecision) {
  openDatabaseConnection().driver.execute(
    `INSERT INTO watched_folder_conflict_decisions (group_id, conflict_key, decision_id,
       decided_at, decided_by_device_identity_key, selected_binding_ids_json,
       source_alias_refs_json, local_reconciled_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, NULL)
     ON CONFLICT(group_id, conflict_key) DO UPDATE SET decision_id = excluded.decision_id,
       decided_at = excluded.decided_at,
       decided_by_device_identity_key = excluded.decided_by_device_identity_key,
       selected_binding_ids_json = excluded.selected_binding_ids_json,
       source_alias_refs_json = excluded.source_alias_refs_json,
       local_reconciled_at = NULL`,
    [value.group_id, value.conflict_key, value.decision_id, value.decided_at,
      value.decided_by_device_identity_key, JSON.stringify(value.selected_binding_ids),
      JSON.stringify(value.source_alias_refs ?? [])]
  );
}
