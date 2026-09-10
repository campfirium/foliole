import { READWISE_SOURCE_CUTOVER_JOURNAL_KEY } from '../readwise/readwiseSourceCutover.js';

import type { DatabaseMigrationTarget } from './migrationTypes.js';
import { tableExists } from './numberedMigrationHelpers.js';
import { migrateReadwiseAutoImportPolicy } from './readwiseAutoImportPolicyMigration.js';

function hasTerminalCutover(sqlite: DatabaseMigrationTarget) {
  if (!tableExists(sqlite, 'settings')) return false;
  const row = sqlite.prepare('SELECT value FROM settings WHERE key = ?')
    .all(READWISE_SOURCE_CUTOVER_JOURNAL_KEY)[0] as { value?: string } | undefined;
  if (!row?.value) return false;
  try {
    const value = JSON.parse(row.value) as Record<string, unknown>;
    return value.version === 2 && value.status === 'api';
  } catch {
    return false;
  }
}

function retireTerminalCandidateStage(sqlite: DatabaseMigrationTarget) {
  if (!hasTerminalCutover(sqlite)) return;
  if (tableExists(sqlite, 'readwise_api_import_stage')) {
    sqlite.exec('DELETE FROM readwise_api_import_stage');
  }
  if (tableExists(sqlite, 'readwise_api_import_runs')) {
    sqlite.exec("DELETE FROM readwise_api_import_runs WHERE phase LIKE 'candidate-v2:%'");
  }
}

export function migrateReadwiseSevenCategoryPolicy(sqlite: DatabaseMigrationTarget) {
  migrateReadwiseAutoImportPolicy(sqlite);
  retireTerminalCandidateStage(sqlite);
}
