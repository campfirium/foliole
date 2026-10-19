import { attachmentDatabaseRevision } from '../../../../../lib/core/attachments/attachmentReferenceSnapshot';
import { loadNodeOwnedArticleResourceNeeds } from '../../../../../lib/core/sync/nodeOwnedArticleResourceNeeds';

import type { CapacitorCompanionDatabaseOwner } from './capacitorCompanionDatabaseOwner';

export async function readCompanionAttachmentReferences(owner: CapacitorCompanionDatabaseOwner, signal?: AbortSignal) {
  const revision = await owner.read(attachmentDatabaseRevision);
  const articles = await owner.readBackgroundSnapshot(db => db.query<{ id: string }>('SELECT id FROM nodes ORDER BY id'), signal);
  const storageKeys = new Set<string>();
  for (let offset = 0; offset < articles.length; offset += 16) {
    signal?.throwIfAborted();
    const ids = articles.slice(offset, offset + 16).map(article => article.id);
    const result = await owner.readBackgroundSnapshot(db => loadNodeOwnedArticleResourceNeeds(db, ids), signal);
    if (result.unreadableArticleIds.length) throw new Error('attachment_scan_body_unreadable');
    for (const need of result.needs) storageKeys.add(need.storageKey);
  }
  // Both comparisons use the writer connection; readonly connection counters are not comparable.
  await owner.read(async db => {
    signal?.throwIfAborted();
    if (revision !== await attachmentDatabaseRevision(db)) throw new Error('attachment_scan_database_changed');
  });
  return { revision, storageKeys: [...storageKeys] };
}
