import type { DbPort, DbRow } from './dbPort.js';
import type { SyncIdentityGlobalPage } from './syncIdentityPagedDiff.js';
import { hashText } from './syncNodeResolution.js';

interface FactRow extends DbRow {
  node_id: string;
  digest: string;
  requirements_digest: string;
  state_fingerprint: string;
  repair_required: number;
}

function schemaName(schema: string) {
  if (!/^[a-z][a-z0-9_]*$/u.test(schema)) throw new Error('sync_identity_schema_invalid');
  return schema;
}

/** Read independent node fact identities in global ID order, with bounded rows and bytes. */
export async function readSyncIdentityNodeFactGlobalPage(port: DbPort,
  after: SyncIdentityGlobalPage['nextAfter'], schema = 'main') {
  if (after && (after.object_type !== 'node' || !after.object_id || after.object_id.length > 2048)) {
    throw new Error('sync_identity_fact_page_invalid');
  }
  const rows = await port.query<FactRow>(`SELECT node_id, digest, requirements_digest,
    state_fingerprint, repair_required FROM ${schemaName(schema)}.sync_identity_node_facts
    WHERE node_id > ? ORDER BY node_id LIMIT 129`, [after?.object_id ?? '']);
  const entries: Array<{ object_type: 'node'; object_id: string; fingerprint: string;
    requirements_digest: string; state_fingerprint: string; repair_required: boolean }> = [];
  let bytes = 2;
  for (const row of rows.slice(0, 128)) {
    const entry = { object_type: 'node' as const, object_id: row.node_id,
      fingerprint: hashText(JSON.stringify([row.digest, row.requirements_digest])),
      requirements_digest: row.requirements_digest, state_fingerprint: row.state_fingerprint,
      repair_required: row.repair_required === 1 };
    const size = new TextEncoder().encode(JSON.stringify(entry)).length + 1;
    if (bytes + size > 65536) {
      if (!entries.length) throw new Error('sync_identity_fact_page_too_large');
      break;
    }
    entries.push(entry);
    bytes += size;
  }
  return { entries, nextAfter: rows.length > entries.length ? {
    object_type: 'node', object_id: entries.at(-1)!.object_id } : null };
}

export async function readSyncIdentityNodeFactInventory(port: DbPort, schema = 'main') {
  const [inventory] = await port.query<{ row_count: number; digest: string }>(
    `SELECT row_count, proof_digest AS digest FROM
      ${schemaName(schema)}.sync_identity_node_fact_summary WHERE partition = 0`);
  if (!inventory || !Number.isSafeInteger(inventory.row_count) || inventory.row_count < 0 ||
      !/^[a-f0-9]{64}$/u.test(inventory.digest)) throw new Error('sync_identity_fact_proof_unready');
  return inventory;
}
