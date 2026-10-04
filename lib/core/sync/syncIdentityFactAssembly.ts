import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';

import type { DbPort } from './dbPort.js';
import { identityParentRowSchema, identityReviewRowSchema,
  identityVersionRowSchema } from './syncIdentityFactRowSchemas.js';
import { IDENTITY_REVIEW_COLUMNS, selectSyncIdentityFactRowCount } from './syncIdentityFactSourceRows.js';
import { IDENTITY_FACT_SCOPE_SQL, identityFactScope } from './syncIdentityFactStaging.js';
import { addSyncIdentityNodeFactDigest } from './syncIdentityNodeFactIndex.js';
import type { SyncIdentityPackPage } from './syncIdentityPackPage.js';
import { describeVersionFact } from './syncPackFactPresence.js';
import { assertValidNodeVersionSnapshot, SYNC_PACK_NODE_VERSION_COLUMNS } from './syncPackNodeVersions.js';

const SECTIONS = ['versions', 'parents', 'reviews'] as const;

async function verifyStagedFacts(port: DbPort, page: SyncIdentityPackPage) {
  const scope = identityFactScope(page);
  const hash = sha256.create();
  for (const section of SECTIONS) {
    let offset = 0;
    const order = section === 'parents' ? `json_extract(row_json, '$.version_id'),
      json_extract(row_json, '$.ordinal'), json_extract(row_json, '$.parent_version_id')` : 'fact_key';
    for (;;) {
      const suffix = `FROM sync_identity_fact_staging WHERE ${IDENTITY_FACT_SCOPE_SQL}
        AND section = ? ORDER BY ${order} LIMIT ? OFFSET ?`;
      const lengths = await port.query<{ payload_bytes: number }>(
        `SELECT length(CAST(row_json AS BLOB)) AS payload_bytes ${suffix}`, [...scope, section, 64, offset]);
      const count = (lengths[0]?.payload_bytes ?? 0) > 2 * 1024 * 1024
        ? 1 : selectSyncIdentityFactRowCount(lengths, 64);
      if (!count) break;
      const rows = await port.query<{ row_json: string }>(
        `SELECT row_json ${suffix}`, [...scope, section, count, offset]);
      for (const row of rows) addStagedFact(hash, section, JSON.parse(row.row_json));
      offset += count;
      if (count === lengths.length && count < 64) break;
    }
  }
  if (bytesToHex(hash.digest()) !== page.facts?.digest) throw new Error('sync_identity_fact_digest_mismatch');
}

function addStagedFact(hash: ReturnType<typeof sha256.create>, section: typeof SECTIONS[number], raw: unknown) {
  if (section === 'versions') {
    const row = identityVersionRowSchema.parse(raw);
    assertValidNodeVersionSnapshot(row);
    addSyncIdentityNodeFactDigest(hash, 'version', describeVersionFact(row));
  } else if (section === 'parents') {
    addSyncIdentityNodeFactDigest(hash, 'parent', identityParentRowSchema.parse(raw));
  } else addSyncIdentityNodeFactDigest(hash, 'review', identityReviewRowSchema.parse(raw));
}

/** Assemble verified pages on disk before the existing production merge transaction adopts a head. */
export async function assembleSyncIdentityStagedFacts(port: DbPort, page: SyncIdentityPackPage) {
  if (page.facts?.section !== 'head') return;
  const scope = identityFactScope(page);
  const sections = await port.query<{ section: string; complete: number }>(
    `SELECT section, complete FROM sync_identity_fact_sections WHERE ${IDENTITY_FACT_SCOPE_SQL}`, scope);
  if (sections.length !== 3 || sections.some((row) => row.complete !== 1 || !SECTIONS.some(
    (section) => section === row.section))) throw new Error('sync_identity_fact_sections_incomplete');
  await verifyStagedFacts(port, page);
  await port.run(`DELETE FROM inc.node_sync_version_parents WHERE version_id IN
    (SELECT version_id FROM inc.node_sync_versions WHERE object_id = ?)`, [scope[3]!]);
  await port.run('DELETE FROM inc.node_sync_versions WHERE object_id = ?', [scope[3]!]);
  await port.run('DELETE FROM inc.review_log WHERE node_id = ?', [scope[3]!]);
  for (const section of SECTIONS) {
    const table = section === 'versions' ? 'node_sync_versions' :
      section === 'parents' ? 'node_sync_version_parents' : 'review_log';
    const columns = section === 'versions' ? SYNC_PACK_NODE_VERSION_COLUMNS :
      section === 'parents' ? ['version_id', 'parent_version_id', 'ordinal'] : IDENTITY_REVIEW_COLUMNS;
    await port.run(`INSERT INTO inc.${table} (${columns.join(', ')})
      SELECT ${columns.map((column) => `json_extract(row_json, '$.${column}')`).join(', ')}
      FROM sync_identity_fact_staging WHERE ${IDENTITY_FACT_SCOPE_SQL} AND section = ?`, [...scope, section]);
  }
}

export async function clearSyncIdentityStagedFacts(port: DbPort, page: SyncIdentityPackPage) {
  if (page.facts?.section !== 'head') return;
  for (const table of ['sync_identity_fact_staging', 'sync_identity_fact_sections']) {
    await port.run(`DELETE FROM ${table} WHERE ${IDENTITY_FACT_SCOPE_SQL}`, identityFactScope(page));
  }
}
