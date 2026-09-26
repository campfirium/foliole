import path from 'node:path';

import type { DatabaseRow } from '../../lib/core/database/driver.js';
import { recordImportSourceSync } from '../../lib/core/database/importPipelineRecords.js';
import { groupWatchedFolderConflicts } from '../../lib/platform/watchedFolderConflictContract.js';

import { openDatabaseConnection } from './connection.js';
import {
  loadUnreconciledWatchedFolderConflictDecisions,
  markWatchedFolderConflictReconciled
} from './watchedFolderConflictDecisions.js';
import { loadWatchedFolderGroupSources } from './watchedFolderGroupSources.js';

interface LegacyImportRow extends DatabaseRow {
  last_imported_at: string;
  source_fingerprint: string;
  source_location: string | null;
}

function relativeLocation(value: string | null) {
  const normalized = value?.replaceAll('\\', '/').replace(/^\.\//u, '') ?? '';
  if (!normalized || normalized === '..' || normalized.startsWith('../') ||
      path.posix.isAbsolute(normalized) || /^[A-Za-z]:\//u.test(normalized)) return null;
  return normalized;
}

function claimLegacyImports(ruleId: string, bindingId: string, now: string) {
  const driver = openDatabaseConnection().driver;
  const oldRef = `watched:${ruleId}`;
  const rows = driver.queryAll<LegacyImportRow>(
    `SELECT source_fingerprint, source_location, last_imported_at FROM import_sources
     WHERE source_ref = ? AND (watched_binding_id IS NULL OR watched_binding_id = ?)
     ORDER BY last_imported_at DESC, source_fingerprint`, [oldRef, ruleId]
  );
  const claimedLocations = new Set<string>();
  for (const row of rows) {
    const location = relativeLocation(row.source_location);
    if (!location || claimedLocations.has(location)) continue;
    claimedLocations.add(location);
    driver.execute(
      `UPDATE import_sources SET watched_binding_id = ?, watched_relative_path = ?,
         source_ref = ?, source_location = ? WHERE source_fingerprint = ?`,
      [bindingId, location, `watched:${bindingId}`, location, row.source_fingerprint]
    );
    recordImportSourceSync(driver, row.source_fingerprint, now);
  }
}

export function reconcileWatchedLegacyImportsAfterSync(now = new Date().toISOString()) {
  const decisions = loadUnreconciledWatchedFolderConflictDecisions();
  if (!decisions.length) return;
  const conflicts = new Map(groupWatchedFolderConflicts(loadWatchedFolderGroupSources())
    .map((conflict) => [conflict.conflict_key, conflict]));
  const driver = openDatabaseConnection().driver;
  driver.transaction(() => {
    for (const decision of decisions) {
      const conflict = conflicts.get(decision.conflict_key);
      if (!conflict) continue;
      const byRule = new Map<string, string[]>();
      for (const source of conflict.sources) {
        const ruleId = source.legacy_rule_id;
        if (!ruleId?.startsWith('draft-import-source-')) continue;
        const candidates = byRule.get(ruleId) ?? [];
        candidates.push(source.binding_id);
        byRule.set(ruleId, candidates);
      }
      for (const [ruleId, candidates] of byRule) {
        const selected = candidates.filter((id) => decision.selected_binding_ids.includes(id));
        const bindingId = (selected.length ? selected : candidates).sort()[0];
        if (bindingId) claimLegacyImports(ruleId, bindingId, now);
      }
      markWatchedFolderConflictReconciled(decision.conflict_key, now);
    }
  });
}
