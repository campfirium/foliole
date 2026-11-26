import { attachmentDatabaseRevision } from '../../../../../lib/core/attachments/attachmentReferenceSnapshot';
import type { DbPort } from '../../../../../lib/core/sync/dbPort';
import { batchArticleResourceIds, listArticleResourceCandidates, loadLibraryAlternativeResourceNeeds,
  loadSizedArticleResourceNeeds } from '../../../../../lib/core/sync/nodeOwnedArticleResourceNeeds';

import type { CapacitorCompanionDatabaseOwner } from './capacitorCompanionDatabaseOwner';

export async function readCompanionAttachmentReferences(owner: CapacitorCompanionDatabaseOwner, signal?: AbortSignal,
  readRevision: (db: DbPort) => Promise<string> = attachmentDatabaseRevision) {
  const revision = await owner.read(readRevision);
  const { candidates, alternatives } = await owner.readBackgroundSnapshot(async db => ({
    candidates: await listArticleResourceCandidates(db), alternatives: await loadLibraryAlternativeResourceNeeds(db)
  }), signal);
  const storageKeys = new Set(alternatives.map(need => need.storageKey));
  // Each bounded batch releases the readonly connection so foreground reads can run between batches.
  for (const ids of batchArticleResourceIds(candidates)) {
    signal?.throwIfAborted();
    const result = await owner.readBackgroundSnapshot(db => loadSizedArticleResourceNeeds(db, ids), signal);
    if (result.unreadableArticleIds.length) throw new Error('attachment_scan_body_unreadable');
    for (const need of result.needs) storageKeys.add(need.storageKey);
  }
  // Both comparisons use the writer connection; readonly connection counters are not comparable.
  await owner.read(async db => {
    signal?.throwIfAborted();
    if (revision !== await readRevision(db)) throw new Error('attachment_scan_database_changed');
  });
  return { revision, storageKeys: [...storageKeys] };
}
