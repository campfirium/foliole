import { COMPANION_SCHEMA_STATEMENTS } from '../../lib/core/database/companionSchemaStatements';
import type { DbPort } from '../../lib/core/sync/dbPort';

import { sha256 } from './capacityAcceptanceSafety';

const time = '2026-09-20T00:00:00.000Z';
export const host = 'T219-isolated';
export async function seedCapacityFixture(db: DbPort, count: number) {
  if (![1000, 10000].includes(count)) throw new Error('Unsupported fixed fixture size');
  for (const sql of COMPANION_SCHEMA_STATEMENTS) await db.run(sql);
  await db.run('INSERT INTO companion_meta VALUES (?, ?, ?)', ['host_name', host, time]);
  await db.transaction(async () => {
    for (let index = 0; index < count; index++) await seedNode(db, index, 4096);
  });
}
async function seedNode(db: DbPort, index: number, bytes: number) {
  const id = `node-${index}`;
  const body = (`Synthetic measurement node ${index}.\n` + 'Representative prose. '.repeat(bytes)).slice(0, bytes);
  const hash = await sha256(body);
  const blob = index % 2 === 0;
  const missing = index % 20 === 0;
  const deleted = index % 50 === 49;
  await db.run(`INSERT INTO nodes (id,parent_id,title,content,body_blob_hash,created_at,updated_at,deleted_at)
    VALUES (?,?,?,?,?,?,?,?)`, [id, index === 0 ? null : 'node-0', `Topic ${index}`,
      blob ? '' : body, blob ? hash : null, time, time, deleted ? time : null]);
  await db.run('INSERT INTO node_order VALUES (?,?)', [id, index]);
  if (blob) await seedBlob(db, hash, body, missing);
  if (index % 5 === 0) await seedMetadata(db, id);
}
async function seedBlob(db: DbPort, hash: string, body: string, missing: boolean) {
  await db.run(`INSERT INTO content_blobs (hash,storage_key,kind,original_size_bytes,stored_size_bytes,
    original_sha256,stored_sha256,availability,created_at) VALUES (?,?,?,?,?,?,?,?,?)`,
    [hash, hash, 'text', body.length, body.length, hash, hash, missing ? 'missing' : 'ready', time]);
  if (!missing) await db.run('INSERT INTO content_blob_data VALUES (?,?)', [hash, new TextEncoder().encode(body)]);
}
async function seedMetadata(db: DbPort, id: string) {
  await db.run('INSERT INTO node_review (node_id,due) VALUES (?,?)', [id, time]);
  await db.run('INSERT INTO node_reading (node_id,last_handled_at,next_at) VALUES (?,?,?)', [id, time, time]);
  await db.run('INSERT INTO node_view_state (node_id,host_name,scroll_top,updated_at) VALUES (?,?,?,?)', [id, host, 100, time]);
  await db.run('INSERT INTO node_open_state VALUES (?,?)', [id, time]);
  await db.run('INSERT INTO attachments VALUES (?,?,?,?,?)', [id, 'synthetic.pdf', 'application/pdf', 1048576, time]);
  await db.run('INSERT INTO node_attachments VALUES (?,?,?)', [id, id, 'reference']);
}
