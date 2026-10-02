import type { DbPort } from './dbPort.js';
import type { NodeVersionPackResult } from './nodeVersionDeliveryProof.js';
import { hashText } from './syncNodeResolution.js';

export interface NodeVersionConfirmationIdentity {
  deviceId: string;
  groupId: string;
  libraryEpoch: string;
  packId: string;
  proofRevision: number;
  results: NodeVersionPackResult[];
}

export function nodeVersionConfirmationDigest(results: NodeVersionPackResult[]) {
  return hashText(JSON.stringify([...results].sort((a, b) => a.objectId.localeCompare(b.objectId))
    .map((row) => [row.objectId, row.sentVersionId, row.result, row.baseVersionId])));
}

/** One current checkpoint per direct peer, never a directory of completed packs. */
export async function isConsumedNodeVersionConfirmation(port: DbPort, args: NodeVersionConfirmationIdentity) {
  const [known] = await port.query<{
    library_epoch: string; proof_revision: number; pack_id: string; receipt_digest: string;
  }>(`SELECT library_epoch, proof_revision, pack_id, receipt_digest
    FROM node_version_confirmation_state WHERE group_id = ? AND device_identity_key = ?`,
  [args.groupId, args.deviceId]);
  if (!known || known.library_epoch !== args.libraryEpoch || known.proof_revision < args.proofRevision) return false;
  if (known.proof_revision === args.proofRevision) {
    if (known.pack_id !== args.packId || known.receipt_digest !== nodeVersionConfirmationDigest(args.results)) {
      throw new Error('node_version_pack_receipt_mismatch');
    }
  }
  return true;
}

export async function saveNodeVersionConfirmationState(port: DbPort, args: NodeVersionConfirmationIdentity) {
  await port.run(`INSERT INTO node_version_confirmation_state
    (group_id, device_identity_key, library_epoch, proof_revision, pack_id, receipt_digest)
    VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(group_id, device_identity_key) DO UPDATE SET
      library_epoch = excluded.library_epoch, proof_revision = excluded.proof_revision,
      pack_id = excluded.pack_id, receipt_digest = excluded.receipt_digest
    WHERE node_version_confirmation_state.library_epoch = excluded.library_epoch
      AND node_version_confirmation_state.proof_revision < excluded.proof_revision`,
  [args.groupId, args.deviceId, args.libraryEpoch, args.proofRevision, args.packId,
    nodeVersionConfirmationDigest(args.results)]);
}
