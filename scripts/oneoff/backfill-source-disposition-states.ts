import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3') as typeof import('better-sqlite3');

type Disposition = 'dismissed' | 'hard_deleted' | 'soft_deleted';

interface SourceRow {
  deleted_at: string | null;
  item_deleted_at: string | null;
  last_imported_at: string | null;
  last_node_id: string | null;
  last_seen_at: string | null;
  last_status: string;
  local_node_state: string;
  node_id: string | null;
  node_updated_at: string | null;
  reading_state: string | null;
  rule_id: string;
  source_path: string;
  title: string | null;
}

interface StateRow {
  disposition: Disposition;
  originalTitle: string;
  sourceKind: 'keep' | 'readwise';
  sourceScope: string;
  updatedAt: string;
}

const DEFAULT_WINDOWS_DATABASE_PATH = 'D:\\X\\U\\Foliole\\Data\\foliole.db';
const DISPOSITION_RANK: Record<Disposition, number> = {
  dismissed: 1,
  soft_deleted: 2,
  hard_deleted: 3
};

function readArg(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function normalizeSourcePath(value: string) {
  return value.replace(/\\/g, '/');
}

function sourceScope(ruleId: string, sourcePath: string) {
  return `${ruleId}:${path.posix.dirname(normalizeSourcePath(sourcePath)) || '.'}`;
}

function loadReadwiseRuleIds(db: import('better-sqlite3').Database) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('import_manager_settings') as { value?: string } | undefined;
  if (!row?.value) return new Set<string>();
  try {
    const parsed = JSON.parse(row.value) as { readwiseSources?: Array<{ id?: unknown }> };
    return new Set((parsed.readwiseSources ?? []).map((source) => source.id).filter((id): id is string => typeof id === 'string'));
  } catch {
    return new Set<string>();
  }
}

function readDisposition(row: SourceRow): Disposition | null {
  if (!row.node_id && row.last_node_id && (row.local_node_state === 'locally_deleted' || row.last_status === 'blocked_deleted' || row.item_deleted_at)) {
    return 'hard_deleted';
  }
  if (row.deleted_at) return 'soft_deleted';
  if (row.reading_state === 'dismissed') return 'dismissed';
  return null;
}

function readUpdatedAt(row: SourceRow, disposition: Disposition, fallback: string) {
  if (disposition === 'hard_deleted') return row.item_deleted_at ?? row.last_seen_at ?? row.last_imported_at ?? fallback;
  if (disposition === 'soft_deleted') return row.deleted_at ?? row.node_updated_at ?? fallback;
  return row.node_updated_at ?? row.last_imported_at ?? fallback;
}

function collectStates(db: import('better-sqlite3').Database, now: string) {
  const readwiseRuleIds = loadReadwiseRuleIds(db);
  const rows = db.prepare(
    `SELECT item.rule_id, item.source_path, item.local_node_state, item.last_status,
            item.last_node_id, item.deleted_at AS item_deleted_at,
            item.last_seen_at, item.last_imported_at, cache.title,
            nodes.id AS node_id, nodes.deleted_at, nodes.updated_at AS node_updated_at,
            reading.state AS reading_state
     FROM keep_import_items item
     INNER JOIN keep_import_item_cache cache
       ON cache.rule_id = item.rule_id
      AND cache.source_path = item.source_path
     LEFT JOIN nodes
       ON nodes.id = item.last_node_id
     LEFT JOIN node_reading reading
       ON reading.node_id = nodes.id
     WHERE item.last_node_id IS NOT NULL`
  ).all() as SourceRow[];
  const states = new Map<string, StateRow>();
  for (const row of rows) {
    const title = row.title?.trim();
    const disposition = readDisposition(row);
    if (!title || !disposition) continue;
    const state: StateRow = {
      disposition,
      originalTitle: title,
      sourceKind: readwiseRuleIds.has(row.rule_id) ? 'readwise' : 'keep',
      sourceScope: sourceScope(row.rule_id, row.source_path),
      updatedAt: readUpdatedAt(row, disposition, now)
    };
    const key = `${state.sourceKind}\u0000${state.sourceScope}\u0000${state.originalTitle}`;
    const existing = states.get(key);
    if (!existing || DISPOSITION_RANK[state.disposition] >= DISPOSITION_RANK[existing.disposition]) {
      states.set(key, state);
    }
  }
  return [...states.values()];
}

const databasePath = readArg('--database') ?? DEFAULT_WINDOWS_DATABASE_PATH;
const dryRun = process.argv.includes('--dry-run');
const db = new Database(databasePath);
const now = new Date().toISOString();
const states = collectStates(db, now);

if (!dryRun) {
  db.transaction((rows: StateRow[]) => {
    const insert = db.prepare(
      `INSERT INTO source_disposition_states (source_kind, source_scope, original_title, disposition, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(source_kind, source_scope, original_title) DO UPDATE SET
         disposition = excluded.disposition,
         updated_at = excluded.updated_at`
    );
    for (const row of rows) {
      insert.run(row.sourceKind, row.sourceScope, row.originalTitle, row.disposition, row.updatedAt);
    }
  })(states);
}

const counts = states.reduce<Record<Disposition, number>>((accumulator, row) => {
  accumulator[row.disposition] += 1;
  return accumulator;
}, { dismissed: 0, hard_deleted: 0, soft_deleted: 0 });
const tableTotal = (db.prepare('SELECT COUNT(*) AS count FROM source_disposition_states').get() as { count: number }).count;

console.log(JSON.stringify({
  databasePath,
  dryRun,
  dismissed: counts.dismissed,
  hardDeleted: counts.hard_deleted,
  softDeleted: counts.soft_deleted,
  tableTotal,
  total: states.length
}, null, 2));

db.close();
