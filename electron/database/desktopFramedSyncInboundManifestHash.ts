import { createHash } from 'node:crypto';

import { failFramedSync, framedSyncBytes } from '../../lib/core/database/framedSyncStagingSerialization.js';
import type { DbPort, DbRow } from '../../lib/core/sync/dbPort.js';
import type { InboundHeaderDeclarationInput } from '../../lib/core/sync/framedSyncStagingContract.js';

interface FactIdentityRow extends DbRow {
  fact_kind: number;
  object_type: string;
  global_id: string;
  fact_id: string;
}

const MANIFEST_DOMAIN = new TextEncoder().encode('foliole-framed-sync-content-v1');
function u32(value: number) { const result = Buffer.alloc(4); result.writeUInt32BE(value); return result; }
function u64(value: bigint) { const result = Buffer.alloc(8); result.writeBigUInt64BE(value); return result; }
function compareText(left: unknown, right: unknown) {
  return Buffer.compare(new TextEncoder().encode(String(left)), new TextEncoder().encode(String(right)));
}
function compareFacts(left: FactIdentityRow, right: FactIdentityRow) {
  return Number(left.fact_kind) - Number(right.fact_kind) || compareText(left.object_type, right.object_type) ||
    compareText(left.global_id, right.global_id) || compareText(left.fact_id, right.fact_id);
}

/** Hash the original unique persisted facts, loading at most one canonical payload at a time. */
export async function hashDesktopFramedSyncInboundManifest(db: DbPort, transferId: Uint8Array,
  attemptId: Uint8Array, declaration: Pick<InboundHeaderDeclarationInput, 'blobs'>) {
  const facts = await db.query<FactIdentityRow>(`SELECT fact_kind, object_type, global_id, fact_id
    FROM framed_sync_inbound_facts WHERE transfer_id = ? AND attempt_id = ?`, [transferId, attemptId]);
  const digest = createHash('sha256');
  digest.update(u32(MANIFEST_DOMAIN.byteLength)); digest.update(MANIFEST_DOMAIN); digest.update(u32(facts.length));
  for (const fact of facts.sort(compareFacts)) {
    const [row] = await db.query<DbRow>(`SELECT canonical_bytes FROM framed_sync_inbound_facts
      WHERE transfer_id = ? AND attempt_id = ? AND fact_kind = ? AND object_type = ?
        AND global_id = ? AND fact_id = ? LIMIT 1`,
    [transferId, attemptId, fact.fact_kind, fact.object_type, fact.global_id, fact.fact_id]);
    if (!row) failFramedSync('inbound_attempt_manifest_mismatch');
    digest.update(framedSyncBytes(row, 'canonical_bytes'));
  }
  const blobs = [...declaration.blobs].sort((left, right) => Buffer.compare(left.sha256, right.sha256));
  digest.update(u32(blobs.length));
  for (const blob of blobs) {
    digest.update(u32(blob.sha256.byteLength)); digest.update(blob.sha256);
    digest.update(u64(blob.byteLength)); digest.update(u32(blob.role));
    digest.update(Uint8Array.of(blob.required ? 1 : 0));
  }
  return { factCount: facts.length, manifestHash: new Uint8Array(digest.digest()) };
}
