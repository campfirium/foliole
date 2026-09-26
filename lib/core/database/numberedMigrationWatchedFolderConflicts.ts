import type { DatabaseMigrationTarget } from './migrationTypes.js';
import { addColumnIfMissing } from './numberedMigrationHelpers.js';

export const WATCHED_FOLDER_CONFLICT_SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS watched_folder_conflict_decisions (
    group_id TEXT NOT NULL,
    conflict_key TEXT NOT NULL,
    decision_id TEXT NOT NULL,
    decided_at TEXT NOT NULL,
    decided_by_device_identity_key TEXT NOT NULL,
    selected_binding_ids_json TEXT NOT NULL,
    source_alias_refs_json TEXT NOT NULL DEFAULT '[]',
    local_reconciled_at TEXT,
    PRIMARY KEY (group_id, conflict_key)
  )`
];

export function createWatchedFolderConflictDecisions(sqlite: DatabaseMigrationTarget) {
  for (const statement of WATCHED_FOLDER_CONFLICT_SCHEMA_STATEMENTS) sqlite.exec(statement);
}

export function addWatchedFolderConflictReconciliation(sqlite: DatabaseMigrationTarget) {
  addColumnIfMissing(sqlite, 'watched_folder_conflict_decisions', 'local_reconciled_at', 'TEXT');
}

export function addWatchedFolderConflictSourceRefs(sqlite: DatabaseMigrationTarget) {
  addColumnIfMissing(sqlite, 'watched_folder_conflict_decisions', 'source_alias_refs_json', "TEXT NOT NULL DEFAULT '[]'");
  const decisions = sqlite.prepare(`SELECT group_id, conflict_key, selected_binding_ids_json
    FROM watched_folder_conflict_decisions`).all() as Array<{
      group_id: string; conflict_key: string; selected_binding_ids_json: string
    }>;
  for (const decision of decisions) {
    const parsedKey = JSON.parse(decision.conflict_key) as [string, string[]];
    const selected = JSON.parse(decision.selected_binding_ids_json) as string[];
    if (!Array.isArray(parsedKey) || !Array.isArray(parsedKey[1]) || !Array.isArray(selected)) continue;
    const bindings = parsedKey[1].map((bindingId) => sqlite.prepare(`SELECT source_ref, local_rule_id
      FROM watched_folder_bindings WHERE binding_id = ?`).all(bindingId)[0] as {
        source_ref: string; local_rule_id: string | null
      } | undefined);
    if (bindings.some((binding, index) => !binding ||
      binding.source_ref !== `watched:${parsedKey[1][index]}`)) continue;
    const refs = new Set<string>();
    bindings.forEach((binding, index) => {
      if (!binding) return;
      if (!selected.includes(parsedKey[1][index]!)) refs.add(binding.source_ref);
      if (binding.local_rule_id?.startsWith('draft-import-source-')) {
        refs.add(`watched:${binding.local_rule_id}`);
      }
    });
    sqlite.prepare(`UPDATE watched_folder_conflict_decisions SET source_alias_refs_json = ?
      WHERE group_id = ? AND conflict_key = ?`).run(JSON.stringify([...refs].sort()),
      decision.group_id, decision.conflict_key);
  }
}
