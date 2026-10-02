import type { DbPort } from '../sync/dbPort.js';
import { nodeVersionConfirmationDigest } from '../sync/nodeVersionConfirmationState.js';
import type { NodeVersionPackResult } from '../sync/nodeVersionDeliveryProof.js';

import type { DatabaseMigrationTarget } from './migrationTypes.js';
import { NODE_VERSION_CONFIRMATION_SCHEMA } from './nodeVersionConfirmationSchema.js';

const CURRENT_RECEIPTS_SQL = `SELECT receipt.* FROM node_version_pack_receipts receipt
  JOIN node_version_device_revisions known ON known.group_id = receipt.group_id
    AND known.device_identity_key = receipt.device_identity_key AND known.pack_id = receipt.pack_id
    AND known.library_epoch = receipt.library_epoch AND known.proof_revision = receipt.proof_revision`;
const RETIRE_RECEIPTS_SQL = [
  'DELETE FROM node_version_inbound_receipts WHERE delivered_at IS NOT NULL',
  `DELETE FROM node_version_pack_receipts WHERE NOT EXISTS
    (SELECT 1 FROM node_version_outbound_holds hold WHERE hold.pack_id = node_version_pack_receipts.pack_id
      AND hold.object_id = node_version_pack_receipts.object_id)`
];
interface ReceiptRow {
  [key: string]: unknown;
  group_id: string; device_identity_key: string; library_epoch: string;
  proof_revision: number; pack_id: string; object_id: string;
  sent_version_id: string; result: NodeVersionPackResult['result']; base_version_id: string | null;
}

function checkpoints(rows: ReceiptRow[]) {
  const groups = new Map<string, ReceiptRow[]>();
  for (const row of rows) {
    const key = JSON.stringify([row.group_id, row.device_identity_key]);
    groups.set(key, [...groups.get(key) ?? [], row]);
  }
  return [...groups.values()].map((receipts) => {
    const row = receipts[0]!;
    const results = receipts.map((receipt) => ({ objectId: receipt.object_id,
      sentVersionId: receipt.sent_version_id, result: receipt.result, baseVersionId: receipt.base_version_id }));
    return [row.group_id, row.device_identity_key, row.library_epoch,
      row.proof_revision, row.pack_id, nodeVersionConfirmationDigest(results)];
  });
}
const INSERT_CHECKPOINT_SQL = `INSERT OR IGNORE INTO node_version_confirmation_state
  (group_id, device_identity_key, library_epoch, proof_revision, pack_id, receipt_digest) VALUES (?, ?, ?, ?, ?, ?)`;

/** Schema-boundary retirement only; never runs a periodic historical receipt sweep. */
export function migrateNodeVersionConfirmations(sqlite: DatabaseMigrationTarget) {
  sqlite.exec(NODE_VERSION_CONFIRMATION_SCHEMA);
  const rows = sqlite.prepare(CURRENT_RECEIPTS_SQL).all() as ReceiptRow[];
  for (const params of checkpoints(rows)) sqlite.prepare(INSERT_CHECKPOINT_SQL).run(...params);
  for (const sql of RETIRE_RECEIPTS_SQL) sqlite.exec(sql);
}

export async function migrateCompanionNodeVersionConfirmations(db: DbPort) {
  await db.run(NODE_VERSION_CONFIRMATION_SCHEMA);
  for (const params of checkpoints(await db.query<ReceiptRow>(CURRENT_RECEIPTS_SQL))) {
    await db.run(INSERT_CHECKPOINT_SQL, params);
  }
  for (const sql of RETIRE_RECEIPTS_SQL) await db.run(sql);
}
