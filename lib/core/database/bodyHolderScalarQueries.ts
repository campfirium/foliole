import { TEXT_BODY_HOLDERS } from './textBodyBlobCollectionQueries.js';

type JsonHolder = Extract<(typeof TEXT_BODY_HOLDERS)[number], readonly [string, string, 'json']>;
export type BodyJsonHolder = Readonly<{ table: JsonHolder[0]; column: JsonHolder[1] }>;
export type ScalarPosition = { holder_rowid: number; scalar_id: number };
export type BodyIdentity = Readonly<{ hash: string; byteLength: number }>;

export function holderSource(holder: BodyJsonHolder) {
  const entry = TEXT_BODY_HOLDERS.find(([table, column, kind]) =>
    kind === 'json' && table === holder.table && column === holder.column);
  if (!entry) throw new Error('body_holder_source_invalid');
  return `FROM ${entry[0]} holder, json_tree(holder.${entry[1]}) fact`;
}


export function scalarRangeQuery(source: string, field: 'value' | 'key', position: ScalarPosition,
  offset: number, length: number) {
  return { sql: `SELECT substr(CAST(fact.${field} AS BLOB), ?, ?) AS data ${source}
    WHERE holder.rowid = ? AND fact.id = ?`,
  params: [offset + 1, length, position.holder_rowid, position.scalar_id] };
}

export function scalarPositionQuery(source: string, field: 'value' | 'key', byteLength: number,
  afterRow: number | null, afterScalar: number) {
  const textCondition = field === 'value' ? "fact.type = 'text'" : "typeof(fact.key) = 'text'";
  return { sql: `SELECT holder.rowid AS holder_rowid, fact.id AS scalar_id ${source}
    WHERE ${textCondition} AND length(CAST(fact.${field} AS BLOB)) = ?
      AND (? IS NULL OR holder.rowid > ? OR (holder.rowid = ? AND fact.id > ?))
    ORDER BY holder.rowid, fact.id LIMIT 1`,
  params: [byteLength, afterRow, afterRow, afterRow, afterScalar] };
}
