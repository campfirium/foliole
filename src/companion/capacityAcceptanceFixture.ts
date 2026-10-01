import { COMPANION_SCHEMA_STATEMENTS } from '../../lib/core/database/companionSchemaStatements';
import { ROOT_CHILD_ORDER_ID } from '../../lib/core/database/parentChildOrder';
import type { DbPort, DbValue } from '../../lib/core/sync/dbPort';

import { sha256 } from './capacityAcceptanceSafety';

const time = '2026-09-20T00:00:00.000Z';
const insertBatchSize = 40;
export const host = 'T219-isolated';
export async function seedCapacityFixture(db: DbPort, count: number) {
  if (![1000, 10000].includes(count)) throw new Error('Unsupported fixed fixture size');
  for (const sql of COMPANION_SCHEMA_STATEMENTS) await db.run(sql);
  await db.run('INSERT INTO companion_meta VALUES (?, ?, ?)', ['host_name', host, time]);
  await seedCapacityNodes(db, 0, count, host);
}

export async function seedCapacityNodes(db: DbPort, start: number, count: number, hostName: string) {
  if (![0, 1000].includes(start) || ![1000, 9000].includes(count) || start + count > 10000) {
    throw new Error('Unsupported fixed fixture range');
  }
  const records = await Promise.all(
    Array.from({ length: count }, (_, offset) => capacityNodeRecords(start + offset, 4096, hostName))
  );
  await db.transaction(async (tx) => {
    await insertRows(tx, `nodes
      (id,parent_id,title,content,body_blob_hash,created_at,updated_at,deleted_at,resource_references)`, 9,
    records.map((record) => record.node));
    const existing = (await tx.query<{ child_ids_json: string }>(
      'SELECT child_ids_json FROM parent_child_order WHERE parent_id = ?', ['node-0']
    ))[0];
    const childIds = [
      ...(existing ? JSON.parse(existing.child_ids_json) as string[] : []),
      ...records.map((record) => record.node[0] as string).filter((id) => id !== 'node-0')
    ];
    await tx.run(
      `INSERT INTO parent_child_order (parent_id, child_ids_json, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(parent_id) DO UPDATE SET child_ids_json = excluded.child_ids_json`,
      ['node-0', JSON.stringify(childIds), time]
    );
    if (start === 0) await tx.run(
      'INSERT INTO parent_child_order (parent_id, child_ids_json, updated_at) VALUES (?, ?, ?)',
      [ROOT_CHILD_ORDER_ID, '["node-0"]', time]
    );
    await insertRows(tx, `content_blobs
      (hash,storage_key,kind,original_size_bytes,stored_size_bytes,original_sha256,stored_sha256,availability,created_at)`,
    9, records.flatMap((record) => record.blob ? [record.blob] : []));
    await insertRows(tx, 'content_blob_data', 2, records.flatMap((record) => record.blobData ? [record.blobData] : []));
    await insertRows(tx, 'node_review (node_id,due)', 2, records.flatMap((record) => record.metadata?.review ?? []));
    await insertRows(tx, 'node_reading (node_id,last_handled_at,next_at)', 3,
      records.flatMap((record) => record.metadata?.reading ?? []));
    await insertRows(tx, 'node_view_state (node_id,host_name,scroll_top,updated_at)', 4,
      records.flatMap((record) => record.metadata?.viewState ?? []));
    await insertRows(tx, 'node_open_state', 2, records.flatMap((record) => record.metadata?.openState ?? []));
  });
}
async function capacityNodeRecords(index: number, bytes: number, hostName: string) {
  const id = `node-${index}`;
  const prose = 'Representative prose. ';
  const body = (`Synthetic measurement node ${index}.\n` + prose.repeat(Math.ceil(bytes / prose.length))).slice(0, bytes);
  const hash = await sha256(body);
  const blob = index % 2 === 0;
  const missing = index % 20 === 0;
  const deleted = index % 50 === 49;
  return {
    node: [id, index === 0 ? null : 'node-0', `Topic ${index}`, blob ? '' : body,
      blob ? hash : null, time, time, deleted ? time : null,
      index % 5 === 0 ? JSON.stringify([{ storage_key: `${hash}.pdf`, original_name: 'synthetic.pdf', role: 'reference' }]) : '[]'] satisfies DbValue[],
    blob: blob ? [hash, hash, 'text', body.length, body.length, hash, hash,
      missing ? 'missing' : 'ready', time] satisfies DbValue[] : null,
    blobData: blob && !missing ? [hash, body] satisfies DbValue[] : null,
    metadata: index % 5 === 0 ? capacityMetadata(id, hostName) : null
  };
}
function capacityMetadata(id: string, hostName: string) {
  return {
    review: [[id, time]], reading: [[id, time, time]], viewState: [[id, hostName, 100, time]],
    openState: [[id, time]]
  } satisfies Record<string, DbValue[][]>;
}
async function insertRows(db: DbPort, table: string, width: number, rows: DbValue[][]) {
  for (let offset = 0; offset < rows.length; offset += insertBatchSize) {
    const batch = rows.slice(offset, offset + insertBatchSize);
    // The fixed fixture bodies are UTF-8 text; SQLite materializes their identical blob bytes.
    const rowSql = table === 'content_blob_data' ? '(?, CAST(? AS BLOB))' : `(${Array(width).fill('?').join(',')})`;
    const placeholders = batch.map(() => rowSql).join(',');
    await db.run(`INSERT INTO ${table} VALUES ${placeholders}`, batch.flat());
  }
}
