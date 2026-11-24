import type { DatabaseMigrationTarget } from './migrationTypes.js';

const slashPath = "replace(source_location, char(92), '/')";
/** Match the separator replacement and single leading './' strip in normalizeWatchedRelativeLocation. */
export const WATCHED_HISTORY_PATH_SQL = `CASE WHEN substr(${slashPath}, 1, 2) = './'
  THEN substr(${slashPath}, 3) ELSE ${slashPath} END`;

export const WATCHED_HISTORY_PATH_INDEX = `CREATE INDEX IF NOT EXISTS idx_import_sources_watched_history_path
  ON import_sources (source_ref, (${WATCHED_HISTORY_PATH_SQL}))`;

export function migrateWatchedHistoryPathIndex(sqlite: DatabaseMigrationTarget) {
  sqlite.exec(WATCHED_HISTORY_PATH_INDEX);
}
