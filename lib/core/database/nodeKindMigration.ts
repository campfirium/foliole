import { NODE_KIND_MIGRATION_CANDIDATES_META_KEY, resolveNodeKind } from '../nodes/nodeKind.js';

interface NodeKindMigrationTarget {
  exec(sql: string): void;
  prepare(sql: string): {
    all(...params: unknown[]): unknown[];
    run(...params: unknown[]): unknown;
  };
}

interface NodeKindMigrationRow {
  anchor_link: string | null;
  content: string;
  created_at: string;
  id: string;
  parent_id: string | null;
  reveal: string | null;
  title: string;
  updated_at: string;
}

interface NodeKindChildCountRow {
  child_count: number;
  parent_id: string | null;
}

function parseAnchorKind(value: string | null): 'highlight' | 'cloze' | null {
  if (!value) {
    return null;
  }
  try {
    const parsed = JSON.parse(value) as { kind?: unknown };
    return parsed.kind === 'highlight' || parsed.kind === 'cloze' ? parsed.kind : null;
  } catch {
    return null;
  }
}

function createSelectColumn(nodeColumns: Set<string>) {
  return (name: string, fallback: string) => (nodeColumns.has(name) ? name : `${fallback} AS ${name}`);
}

function queryNodeKindRows(sqlite: NodeKindMigrationTarget, selectColumn: ReturnType<typeof createSelectColumn>) {
  return sqlite
    .prepare(
      `SELECT
         ${selectColumn('id', "''")},
         ${selectColumn('parent_id', 'NULL')},
         ${selectColumn('title', "''")},
         ${selectColumn('content', "''")},
         ${selectColumn('reveal', 'NULL')},
         ${selectColumn('anchor_link', 'NULL')},
         ${selectColumn('created_at', "''")},
         ${selectColumn('updated_at', "''")}
       FROM nodes`
    )
    .all() as NodeKindMigrationRow[];
}

function queryChildCounts(sqlite: NodeKindMigrationTarget, nodeColumns: Set<string>, selectColumn: ReturnType<typeof createSelectColumn>) {
  return new Map(
    (sqlite
      .prepare(
        `SELECT ${selectColumn('parent_id', 'NULL')}, COUNT(*) AS child_count
         FROM nodes
         GROUP BY ${nodeColumns.has('parent_id') ? 'parent_id' : 'NULL'}`
      )
      .all() as NodeKindChildCountRow[])
      .filter((row) => typeof row.parent_id === 'string')
      .map((row) => [row.parent_id, row.child_count])
  );
}

function writeCandidateReport(sqlite: NodeKindMigrationTarget, candidates: Array<Record<string, unknown>>, generatedAt: string) {
  const deleteCandidates = sqlite.prepare('DELETE FROM workspace_meta WHERE key = ?');
  if (candidates.length === 0) {
    deleteCandidates.run(NODE_KIND_MIGRATION_CANDIDATES_META_KEY);
    return;
  }
  sqlite.prepare(
    `INSERT INTO workspace_meta (key, value, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  ).run(
    NODE_KIND_MIGRATION_CANDIDATES_META_KEY,
    JSON.stringify({ generatedAt, strategy: 'empty-leaf-fallback-topic', candidates }),
    generatedAt
  );
}

export function migrateNodeKinds(sqlite: NodeKindMigrationTarget) {
  const nodeColumns = new Set(
    (sqlite.prepare('PRAGMA table_info(nodes)').all() as Array<{ name: string }>).map((column) => column.name)
  );
  const selectColumn = createSelectColumn(nodeColumns);
  const rows = queryNodeKindRows(sqlite, selectColumn);
  const childCounts = queryChildCounts(sqlite, nodeColumns, selectColumn);

  sqlite.exec(
    `CREATE TABLE IF NOT EXISTS workspace_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`
  );
  const updateKind = sqlite.prepare('UPDATE nodes SET kind = ? WHERE id = ?');
  const generatedAt = new Date().toISOString();
  const candidates: Array<Record<string, unknown>> = [];

  for (const row of rows) {
    const resolution = resolveNodeKind({
      anchorLinkKind: parseAnchorKind(row.anchor_link),
      childCount: childCounts.get(row.id) ?? 0,
      content: row.content,
      isInbox: row.id === 'special-inbox',
      reveal: row.reveal
    });
    updateKind.run(resolution.kind, row.id);
    if (resolution.reason === 'empty-leaf-fallback-topic') {
      candidates.push({
        nodeId: row.id,
        parentNodeId: row.parent_id,
        title: row.title,
        fallbackKind: resolution.kind,
        reason: resolution.reason,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      });
    }
  }

  writeCandidateReport(sqlite, candidates, generatedAt);
}
