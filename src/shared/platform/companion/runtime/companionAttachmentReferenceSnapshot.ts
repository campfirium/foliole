import { attachmentDatabaseRevision, readAttachmentReferenceSnapshot } from '../../../../../lib/core/attachments/attachmentReferenceSnapshot';

import type { CapacitorCompanionDatabaseOwner } from './capacitorCompanionDatabaseOwner';

export async function readCompanionAttachmentReferences(owner: CapacitorCompanionDatabaseOwner, signal?: AbortSignal) {
  const revision = await owner.read(attachmentDatabaseRevision);
  const snapshot = await owner.readSnapshot(db => readAttachmentReferenceSnapshot(db, signal), signal);
  // Both comparisons use the writer connection; readonly connection counters are not comparable.
  await owner.read(async db => {
    signal?.throwIfAborted();
    if (revision !== await attachmentDatabaseRevision(db)) throw new Error('attachment_scan_database_changed');
  });
  return { revision, storageKeys: snapshot.storageKeys };
}
