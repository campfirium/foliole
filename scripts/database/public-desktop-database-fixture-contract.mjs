import { createHash } from 'node:crypto';

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function readStructureSummary(sqlite) {
  const objects = sqlite.prepare(`SELECT type, name, tbl_name AS tableName, sql
    FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%'
    ORDER BY type, name`).all().map((row) => ({
    ...row,
    sql: row.sql?.replace(/\s+/g, ' ').trim() ?? null
  }));
  return { objectCount: objects.length, sha256: sha256(JSON.stringify(objects)) };
}
