import path from 'node:path';

const FOLIOLE_SEARCH_DB_FILE = 'foliole-index.db';
const FOLIOLE_EXTERNAL_DB_FILE = 'foliole-external.db';

export function resolveSearchDatabasePath(databasePath: string) {
  return path.join(path.dirname(databasePath), FOLIOLE_SEARCH_DB_FILE);
}

export function resolveExternalSearchDatabasePath(databasePath: string) {
  return path.join(path.dirname(databasePath), FOLIOLE_EXTERNAL_DB_FILE);
}
