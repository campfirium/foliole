import type { DbPort } from './dbPort.js';
import { decodeIdentityFactChunk, syncIdentityFactChunkPayloadSchema,
  type SyncIdentityFactChunk } from './syncIdentityFactChunk.js';
import { identityParentRowSchema, identityReviewRowSchema, identityVersionRowSchema } from './syncIdentityFactRowSchemas.js';
import { IDENTITY_FACT_SCOPE_SQL, identityFactScope } from './syncIdentityFactScope.js';
import { compareSyncIdentityFactKeys, syncIdentityFactKey,
  syncIdentityFactTailSchema } from './syncIdentityFactTransfer.js';
import type { SyncIdentityPackPage } from './syncIdentityPackPage.js';

/** Persist exact byte slices; incomplete JSON stays BLOB and cannot become a complete section. */
export async function stageSyncIdentityFactChunk(port: DbPort, page: SyncIdentityPackPage,
  metadata: SyncIdentityFactChunk, rawTail: unknown) {
  const facts = page.facts;
  if (!facts || facts.section === 'head' || !facts.chunk && metadata.offset !== 0) throw new Error('sync_identity_fact_request_invalid');
  const [ordinary] = await port.query<{ count: number }>(`SELECT
    (SELECT COUNT(*) FROM inc.node_sync_versions) + (SELECT COUNT(*) FROM inc.node_sync_version_parents) +
    (SELECT COUNT(*) FROM inc.review_log) AS count`);
  if (ordinary?.count !== 0) throw new Error('sync_identity_fact_chunk_scope_invalid');
  const tail = syncIdentityFactTailSchema.parse(rawTail);
  const scope = identityFactScope(page);
  const [stored] = await port.query<{ value: string }>("SELECT value FROM inc.pack_manifest WHERE key = 'fact_chunk'");
  const payload = syncIdentityFactChunkPayloadSchema.parse(JSON.parse(stored?.value ?? 'null'));
  if (JSON.stringify(metadata) !== JSON.stringify({ key: payload.key, offset: payload.offset, total: payload.total })) {
    throw new Error('sync_identity_fact_chunk_invalid');
  }
  const bytes = decodeIdentityFactChunk(payload);
  const nextOffset = metadata.offset + bytes.length;
  const finished = nextOffset === metadata.total;
  if (finished ? tail.chunk !== undefined || tail.nextAfter !== null && tail.nextAfter !== metadata.key :
      !tail.chunk || tail.nextAfter !== facts.after || tail.chunk.key !== metadata.key ||
      tail.chunk.nextOffset !== nextOffset || tail.chunk.total !== metadata.total) {
    throw new Error('sync_identity_fact_tail_invalid');
  }
  if (facts.after !== null && compareSyncIdentityFactKeys(facts.section, facts.after, metadata.key) >= 0) {
    throw new Error('sync_identity_fact_row_order_invalid');
  }
  const [received] = await port.query(`SELECT 1 FROM sync_identity_pack_receipts
    WHERE group_id = ? AND source_peer_id = ? AND source_view_id = ? AND page_id = ? LIMIT 1`,
  [scope[0]!, scope[1]!, scope[2]!, page.page_id]);
  if (received) {
    const [saved] = await port.query<{ bytes: string }>(`SELECT hex(substr(CAST(row_json AS BLOB), ?, ?)) AS bytes
      FROM sync_identity_fact_staging WHERE ${IDENTITY_FACT_SCOPE_SQL} AND section = ? AND fact_key = ?`,
    [metadata.offset + 1, bytes.length, ...scope, facts.section, metadata.key]);
    const expected = Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('').toUpperCase();
    if (saved?.bytes !== expected) throw new Error('sync_identity_fact_replay_mismatch');
    return;
  }
  await appendChunk(port, page, metadata, bytes);
  if (finished) await finishChunk(port, page, metadata);
  const progress = finished ? metadata.key : JSON.stringify({ after: facts.after,
    key: metadata.key, nextOffset, total: metadata.total });
  await port.run(`INSERT INTO sync_identity_fact_sections
    (group_id, source_peer_id, source_view_id, node_id, fact_digest, section, last_key, complete)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(group_id, source_peer_id, source_view_id, node_id, section)
    DO UPDATE SET last_key = excluded.last_key, complete = excluded.complete`,
  [...scope, facts.section, progress, finished && tail.nextAfter === null ? 1 : 0]);
}

async function appendChunk(port: DbPort, page: SyncIdentityPackPage, metadata: SyncIdentityFactChunk,
  bytes: Uint8Array) {
  const facts = page.facts;
  if (!facts || facts.section === 'head') throw new Error('sync_identity_fact_request_invalid');
  const scope = identityFactScope(page);
  const [progress] = await port.query<{ last_key: string | null; complete: number }>(
    `SELECT last_key, complete FROM sync_identity_fact_sections WHERE ${IDENTITY_FACT_SCOPE_SQL} AND section = ?`,
    [...scope, facts.section]);
  const expected = metadata.offset === 0 ? facts.after : JSON.stringify({ after: facts.after,
    key: metadata.key, nextOffset: metadata.offset, total: metadata.total });
  if ((progress?.last_key ?? null) !== expected || progress?.complete === 1) {
    throw new Error('sync_identity_fact_page_not_contiguous');
  }
  if (metadata.offset === 0) {
    await port.run(`INSERT INTO sync_identity_fact_staging
      (group_id, source_peer_id, source_view_id, node_id, fact_digest, section, fact_key, row_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [...scope, facts.section, metadata.key, bytes]);
  } else {
    const result = await port.run(`UPDATE sync_identity_fact_staging SET row_json = CAST(row_json || ? AS BLOB)
      WHERE ${IDENTITY_FACT_SCOPE_SQL} AND section = ? AND fact_key = ?
        AND typeof(row_json) = 'blob' AND length(row_json) = ?`,
    [bytes, ...scope, facts.section, metadata.key, metadata.offset]);
    if (result.changes !== 1) throw new Error('sync_identity_fact_chunk_not_contiguous');
  }
  const [length] = await port.query<{ bytes: number }>(`SELECT length(row_json) AS bytes
    FROM sync_identity_fact_staging WHERE ${IDENTITY_FACT_SCOPE_SQL} AND section = ? AND fact_key = ?`,
  [...scope, facts.section, metadata.key]);
  if (length?.bytes !== metadata.offset + bytes.length) throw new Error('sync_identity_fact_chunk_length_invalid');
}

async function finishChunk(port: DbPort, page: SyncIdentityPackPage, metadata: SyncIdentityFactChunk) {
  const scope = identityFactScope(page);
  const facts = page.facts;
  if (!facts || facts.section === 'head') throw new Error('sync_identity_fact_request_invalid');
  const [complete] = await port.query<{ row_json: string }>(`SELECT CAST(row_json AS TEXT) AS row_json
    FROM sync_identity_fact_staging WHERE ${IDENTITY_FACT_SCOPE_SQL} AND section = ? AND fact_key = ?`,
  [...scope, facts.section, metadata.key]);
  const schemas = { versions: identityVersionRowSchema, parents: identityParentRowSchema, reviews: identityReviewRowSchema };
  const section = facts.section;
  const row = schemas[section].parse(JSON.parse(complete?.row_json ?? 'null'));
  if (syncIdentityFactKey(section, row) !== metadata.key ||
      ('object_id' in row && row.object_id !== scope[3]) || ('node_id' in row && row.node_id !== scope[3])) {
    throw new Error('sync_identity_fact_scope_invalid');
  }
  await port.run(`UPDATE sync_identity_fact_staging SET row_json = CAST(row_json AS TEXT)
    WHERE ${IDENTITY_FACT_SCOPE_SQL} AND section = ? AND fact_key = ?`, [...scope, section, metadata.key]);
}
