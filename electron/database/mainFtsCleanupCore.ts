type SqliteDatabase = import('better-sqlite3').Database;

const LEGACY_MAIN_FTS_TABLES = ['node_search', 'pdf_search'] as const;

export interface CleanupLegacyMainFtsOptions {
  createSnapshot: () => unknown;
  sourceDatabase: SqliteDatabase;
  vacuum?: boolean;
}

export interface CleanupLegacyMainFtsResult<TSnapshot> {
  droppedTables: string[];
  legacyObjectNamesAfter: string[];
  legacyObjectNamesBefore: string[];
  pageCountAfterVacuum: number | null;
  pageCountBeforeVacuum: number | null;
  snapshot: TSnapshot | null;
  status: 'already-clean' | 'cleaned';
  vacuumed: boolean;
}

export function cleanupLegacyMainFtsTables<TSnapshot>({
  createSnapshot,
  sourceDatabase,
  vacuum = false
}: CleanupLegacyMainFtsOptions): CleanupLegacyMainFtsResult<TSnapshot> {
  const legacyObjectNamesBefore = listLegacyMainFtsObjectNames(sourceDatabase);
  if (legacyObjectNamesBefore.length === 0) {
    return {
      droppedTables: [],
      legacyObjectNamesAfter: [],
      legacyObjectNamesBefore,
      pageCountAfterVacuum: null,
      pageCountBeforeVacuum: null,
      snapshot: null,
      status: 'already-clean',
      vacuumed: false
    };
  }

  const snapshot = createSnapshot() as TSnapshot;
  const pageCountBeforeVacuum = readPageCount(sourceDatabase);
  const droppedTables = dropLegacyMainFtsTables(sourceDatabase);
  const legacyObjectNamesAfterDrop = listLegacyMainFtsObjectNames(sourceDatabase);

  if (!vacuum) {
    return {
      droppedTables,
      legacyObjectNamesAfter: legacyObjectNamesAfterDrop,
      legacyObjectNamesBefore,
      pageCountAfterVacuum: null,
      pageCountBeforeVacuum,
      snapshot,
      status: 'cleaned',
      vacuumed: false
    };
  }

  sourceDatabase.pragma('wal_checkpoint(TRUNCATE)');
  sourceDatabase.exec('VACUUM main');

  return {
    droppedTables,
    legacyObjectNamesAfter: listLegacyMainFtsObjectNames(sourceDatabase),
    legacyObjectNamesBefore,
    pageCountAfterVacuum: readPageCount(sourceDatabase),
    pageCountBeforeVacuum,
    snapshot,
    status: 'cleaned',
    vacuumed: true
  };
}

export function listLegacyMainFtsObjectNames(sqlite: SqliteDatabase): string[] {
  return sqlite
    .prepare(
      `SELECT name
       FROM main.sqlite_master
       WHERE type IN ('table', 'index')
         AND (name = 'node_search'
           OR name LIKE 'node_search_%'
           OR name = 'pdf_search'
           OR name LIKE 'pdf_search_%')
       ORDER BY name`
    )
    .all()
    .map((row) => (row as { name: string }).name);
}

function dropLegacyMainFtsTables(sqlite: SqliteDatabase) {
  const existingTables = new Set(listMainTableNames(sqlite));
  const droppedTables: string[] = [];
  sqlite.transaction(() => {
    for (const tableName of LEGACY_MAIN_FTS_TABLES) {
      if (existingTables.has(tableName)) {
        sqlite.exec(`DROP TABLE IF EXISTS main.${tableName}`);
        droppedTables.push(tableName);
      }
    }
  })();
  return droppedTables;
}

function listMainTableNames(sqlite: SqliteDatabase) {
  return sqlite
    .prepare(
      `SELECT name
       FROM main.sqlite_master
       WHERE type = 'table'
         AND name IN ('node_search', 'pdf_search')`
    )
    .all()
    .map((row) => (row as { name: string }).name);
}

function readPageCount(sqlite: SqliteDatabase) {
  const row = sqlite.prepare('PRAGMA main.page_count').get() as { page_count: number };
  return row.page_count;
}
