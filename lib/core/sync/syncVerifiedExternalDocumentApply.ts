import type { NativeSyncObjectRecord } from '../../platform/nativeSyncContract.js';

import { adoptVerifiedBody } from './bodyContentWrite.js';
import type { DbPort } from './dbPort.js';
import { applySyncObjectInTransaction, type ApplySyncObjectsWithDbPortOptions } from './syncObjectApplyExecutor.js';
import { asObject, text } from './syncObjectPayloadValues.js';
import type { VerifiedBodyRef } from './verifiedBody.js';

type ExternalDocumentRecord = NativeSyncObjectRecord & { object_type: 'external_document' };
export type ExternalDocumentBody =
  | Readonly<{ kind: 'readable'; ref: VerifiedBodyRef }>
  | Readonly<{ kind: 'unavailable'; hash: string }>
  | Readonly<{ kind: 'absent' }>;

/** Caller owns the business transaction; the payload hook can enqueue the existing background search worker. */
export function applyVerifiedExternalDocumentInTransaction(
  db: DbPort, record: ExternalDocumentRecord, body: ExternalDocumentBody,
  options: ApplySyncObjectsWithDbPortOptions = {}
) {
  const payload = asObject(record);
  if (Object.hasOwn(payload, 'content')) throw new Error('external_document_metadata_contains_body');
  const bodyHash = text(payload.body_blob_hash);
  const matches = body.kind === 'absent' ? bodyHash === null : bodyHash === (body.kind === 'readable' ? body.ref.hash : body.hash);
  if ((record.deleted_at && body.kind !== 'absent') || (!record.deleted_at && !matches)) {
    throw new Error('framed_sync_external_document_body_invalid');
  }
  return applySyncObjectInTransaction(db, record, {
    ...options,
    async onPayloadAppliedInTransaction(tx, applied) {
      if (!record.deleted_at) {
        if (body.kind === 'readable') await adoptVerifiedBody(tx, body.ref, record.updated_at);
        await tx.run("UPDATE external_documents SET content = '' WHERE document_id = ?", [record.object_id]);
      }
      await options.onPayloadAppliedInTransaction?.(tx, applied);
    }
  });
}
