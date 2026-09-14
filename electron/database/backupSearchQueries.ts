import type { NativeBackupSearchMatch } from '../../lib/platform/nativeBackupSearchContract.js';

import { verifyDatabaseIntegrity, type SqliteDatabase } from './integrity.js';

interface BackupSearchSchema {
  hasBlobContent: boolean;
  hasDeletedAt: boolean;
  hasParentId: boolean;
}

interface BackupSearchRow {
  content: Buffer | string | null;
  deleted_at: string | null;
  id: string;
  parent_id: string | null;
  title: string | null;
}

function tableColumns(sqlite: SqliteDatabase, table: string) {
  const rows = sqlite.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name?: unknown }>;
  return new Set(rows.map((row) => row.name).filter((name): name is string => typeof name === 'string'));
}

export function inspectBackupSearchSchema(sqlite: SqliteDatabase): BackupSearchSchema {
  verifyDatabaseIntegrity(sqlite);
  const nodes = tableColumns(sqlite, 'nodes');
  for (const required of ['id', 'title', 'content']) {
    if (!nodes.has(required)) throw new Error(`unsupported backup schema: nodes.${required} is missing`);
  }
  const blobData = tableColumns(sqlite, 'content_blob_data');
  return {
    hasBlobContent: nodes.has('body_blob_hash') && blobData.has('hash') && blobData.has('data'),
    hasDeletedAt: nodes.has('deleted_at'),
    hasParentId: nodes.has('parent_id')
  };
}

function contentExpression(schema: BackupSearchSchema) {
  return schema.hasBlobContent
    ? "CAST(COALESCE(cbd.data, n.content, '') AS TEXT)"
    : "CAST(COALESCE(n.content, '') AS TEXT)";
}

function selectMatchSql(schema: BackupSearchSchema) {
  const content = contentExpression(schema);
  return `SELECT n.id, ${schema.hasParentId ? 'n.parent_id' : 'NULL'} AS parent_id,
      n.title, ${content} AS content,
      ${schema.hasDeletedAt ? 'n.deleted_at' : 'NULL'} AS deleted_at
    FROM nodes n
    ${schema.hasBlobContent ? 'LEFT JOIN content_blob_data cbd ON cbd.hash = n.body_blob_hash' : ''}
    WHERE instr(lower(CAST(COALESCE(n.title, '') AS TEXT)), lower(?)) > 0
       OR instr(lower(${content}), lower(?)) > 0
    ORDER BY CASE WHEN instr(lower(CAST(COALESCE(n.title, '') AS TEXT)), lower(?)) > 0 THEN 0 ELSE 1 END,
      lower(CAST(COALESCE(n.title, '') AS TEXT)) ASC, n.id ASC
    LIMIT 1 OFFSET ?`;
}

function stringContent(value: Buffer | string | null) {
  if (Buffer.isBuffer(value)) return value.toString('utf8');
  return value ?? '';
}

function nodePath(sqlite: SqliteDatabase, row: BackupSearchRow, schema: BackupSearchSchema) {
  const titles: string[] = [];
  if (!schema.hasParentId) return '';
  const parentQuery = sqlite.prepare('SELECT id, parent_id, title FROM nodes WHERE id = ?');
  const seen = new Set([row.id]);
  let parentId = row.parent_id;
  while (parentId && titles.length < 100 && !seen.has(parentId)) {
    seen.add(parentId);
    const parent = parentQuery.get(parentId) as Pick<BackupSearchRow, 'id' | 'parent_id' | 'title'> | undefined;
    if (!parent) break;
    titles.unshift(parent.title?.trim() || parent.id);
    parentId = parent.parent_id;
  }
  return titles.slice(1).join(' / ');
}

export function findBackupSearchMatch(args: {
  backupName: string;
  backupUpdatedAt: string;
  offset: number;
  query: string;
  schema: BackupSearchSchema;
  sqlite: SqliteDatabase;
}): NativeBackupSearchMatch | null {
  const row = args.sqlite.prepare(selectMatchSql(args.schema))
    .get(args.query, args.query, args.query, args.offset) as BackupSearchRow | undefined;
  if (!row) return null;
  return {
    backup_name: args.backupName,
    backup_updated_at: args.backupUpdatedAt,
    content: stringContent(row.content),
    deleted: Boolean(row.deleted_at),
    node_id: row.id,
    path: nodePath(args.sqlite, row, args.schema),
    title: row.title?.trim() || row.id
  };
}
