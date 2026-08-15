export function classifySqliteReadError(error) {
  const message = error instanceof Error ? error.message : String(error);
  if (/database disk image is malformed/iu.test(message)) return 'snapshot_inconsistent_or_corrupt';
  if (/database is locked/iu.test(message)) return 'database_locked';
  if (/unable to open database file/iu.test(message)) return 'database_open_failed';
  if (/no such table/iu.test(message)) return 'database_schema_incomplete';
  if (/file is not a database|unsupported file format/iu.test(message)) return 'invalid_database_file';
  return 'database_snapshot_unreadable';
}
