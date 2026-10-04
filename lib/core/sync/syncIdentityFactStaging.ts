import type { DbPort, DbRow } from './dbPort.js';
import type { SyncIdentityFactChunk } from './syncIdentityFactChunk.js';
import { stageSyncIdentityFactChunk } from './syncIdentityFactChunkStaging.js';
import { IDENTITY_FACT_SCOPE_SQL, identityFactScope } from './syncIdentityFactScope.js';
import { IDENTITY_REVIEW_COLUMNS } from './syncIdentityFactSourceRows.js';
import { compareSyncIdentityFactKeys, syncIdentityFactKey } from './syncIdentityFactTransfer.js';
import type { SyncIdentityPackPage } from './syncIdentityPackPage.js';
import { SYNC_PACK_NODE_VERSION_COLUMNS } from './syncPackNodeVersions.js';

export { IDENTITY_FACT_SCOPE_SQL, identityFactScope } from './syncIdentityFactScope.js';

/** Keep received history outside business tables until all three sections are verified. */
export async function stageSyncIdentityFactPage(port: DbPort, page: SyncIdentityPackPage,
  tail: { nextAfter: string | null }, chunk?: SyncIdentityFactChunk) {
  if (chunk) return stageSyncIdentityFactChunk(port, page, chunk, tail);
  const facts = page.facts;
  if (!facts || facts.section === 'head') throw new Error('sync_identity_fact_request_invalid');
  const scope = identityFactScope(page);
  const [progress] = await port.query<{ last_key: string | null; complete: number }>(
    `SELECT last_key, complete FROM sync_identity_fact_sections WHERE ${IDENTITY_FACT_SCOPE_SQL} AND section = ?`,
    [...scope, facts.section]);
  const rows = await readFactRows(port, facts);
  const last = rows.at(-1);
  let previous = facts.after;
  for (const row of rows) {
    const key = syncIdentityFactKey(facts.section, row);
    if (previous !== null && compareSyncIdentityFactKeys(facts.section, previous, key) >= 0) {
      throw new Error('sync_identity_fact_row_order_invalid');
    }
    previous = key;
  }
  if (tail.nextAfter !== null && (!last || syncIdentityFactKey(facts.section, last) !== tail.nextAfter)) {
    throw new Error('sync_identity_fact_tail_invalid');
  }
  const [received] = await port.query<{ page_id: string }>(`SELECT page_id
    FROM sync_identity_pack_receipts WHERE group_id = ? AND source_peer_id = ?
    AND source_view_id = ? AND page_id = ? LIMIT 1`, [scope[0]!, scope[1]!, scope[2]!, page.page_id]);
  if (received) {
    for (const row of rows) {
      const [saved] = await port.query<{ row_json: string }>(`SELECT row_json
        FROM sync_identity_fact_staging WHERE ${IDENTITY_FACT_SCOPE_SQL} AND section = ? AND fact_key = ?`,
      [...scope, facts.section, syncIdentityFactKey(facts.section, row)]);
      if (saved?.row_json !== JSON.stringify(row)) throw new Error('sync_identity_fact_replay_mismatch');
    }
    return;
  }
  const [partial] = await port.query(`SELECT 1 FROM sync_identity_fact_staging
    WHERE ${IDENTITY_FACT_SCOPE_SQL} AND section = ? AND typeof(row_json) = 'blob' LIMIT 1`,
  [...scope, facts.section]);
  if (partial) throw new Error('sync_identity_fact_chunk_incomplete');
  if ((progress?.last_key ?? null) !== facts.after || progress?.complete === 1) {
    throw new Error('sync_identity_fact_page_not_contiguous');
  }
  for (const row of rows) {
    if (facts.section !== 'parents' && row[facts.section === 'reviews' ? 'node_id' : 'object_id'] !== scope[3]) {
      throw new Error('sync_identity_fact_scope_invalid');
    }
    await port.run(`INSERT INTO sync_identity_fact_staging
      (group_id, source_peer_id, source_view_id, node_id, fact_digest, section, fact_key, row_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [...scope, facts.section,
      syncIdentityFactKey(facts.section, row), JSON.stringify(row)]);
  }
  await port.run(`INSERT INTO sync_identity_fact_sections
    (group_id, source_peer_id, source_view_id, node_id, fact_digest, section, last_key, complete)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(group_id, source_peer_id, source_view_id, node_id, section)
    DO UPDATE SET last_key = excluded.last_key, complete = excluded.complete`,
  [...scope, facts.section, last ? syncIdentityFactKey(facts.section, last) : null, tail.nextAfter === null ? 1 : 0]);
}

async function readFactRows(port: DbPort, facts: NonNullable<SyncIdentityPackPage['facts']>) {
  const table = facts.section === 'versions' ? 'node_sync_versions' :
    facts.section === 'parents' ? 'node_sync_version_parents' : 'review_log';
  const columns = facts.section === 'versions' ? SYNC_PACK_NODE_VERSION_COLUMNS :
    facts.section === 'parents' ? ['version_id', 'parent_version_id', 'ordinal'] : IDENTITY_REVIEW_COLUMNS;
  const rows = await port.query<DbRow>(`SELECT ${columns.join(', ')} FROM inc.${table}
    ORDER BY ${facts.section === 'parents' ? 'version_id, ordinal, parent_version_id' :
      facts.section === 'reviews' ? 'op_id' : 'version_id'} LIMIT 65`);
  if (rows.length > facts.limit || new TextEncoder().encode(JSON.stringify(rows)).length > 2 * 1024 * 1024 + 128) {
    throw new Error('sync_identity_fact_page_over_budget');
  }
  return rows;
}
