import { loadArticleAttachmentNeeds } from '../sync/articleAttachmentNeeds.js';
import type { DbPort } from '../sync/dbPort.js';

export async function attachmentDatabaseRevision(port: DbPort) {
  const data = await port.query('PRAGMA data_version');
  const changes = await port.query('SELECT total_changes() AS changes');
  return JSON.stringify([data, changes]);
}

export async function readAttachmentReferenceSnapshot(port: DbPort, signal?: AbortSignal) {
  const revision = await attachmentDatabaseRevision(port);
  const articles = await port.query<{ id: string }>('SELECT id FROM nodes ORDER BY id');
  const storageKeys = new Set<string>();
  for (const article of articles) {
    signal?.throwIfAborted();
    const result = await loadArticleAttachmentNeeds(port, [article.id]);
    if (result.unreadableArticleIds.length) throw new Error('attachment_scan_body_unreadable');
    for (const need of result.needs) storageKeys.add(need.storageKey);
  }
  if (revision !== await attachmentDatabaseRevision(port)) throw new Error('attachment_scan_database_changed');
  return { revision, storageKeys: [...storageKeys] };
}
