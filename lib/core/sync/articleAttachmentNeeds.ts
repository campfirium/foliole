import { buildCanonicalAttachmentStorageKey, parseCanonicalAttachmentStorageKey } from '../../platform/attachmentResource.js';
import { collectArticleImageStorageKeys } from '../import/replaceArticleImageSource.js';

import type { DbPort } from './dbPort.js';

export interface ArticleAttachmentNeed {
  attachmentId: string;
  contentHash: string;
  mimeType: string;
  storageKey: string;
  sizeBytes?: number;
}

// Only ids from this delivery participate; metadata and historical image relations are not demand.
export async function loadArticleAttachmentNeeds(port: DbPort, articleIds: readonly string[]) {
  const needs = new Map<string, ArticleAttachmentNeed>();
  const unreadableArticleIds: string[] = [];
  for (const id of new Set(articleIds)) {
    const [article] = await port.query<{ body_hash: string | null; content: string | null }>(
      `SELECT n.body_blob_hash AS body_hash,
       CASE WHEN n.body_blob_hash IS NOT NULL AND n.body_blob_hash <> ''
         THEN CASE WHEN cb.compression = 'none' THEN CAST(cbd.data AS TEXT) END
         ELSE n.content END AS content
       FROM nodes n LEFT JOIN content_blobs cb ON cb.hash = n.body_blob_hash
       LEFT JOIN content_blob_data cbd ON cbd.hash = n.body_blob_hash WHERE n.id = ?`, [id]
    );
    if (!article) continue;
    if (article.body_hash && article.content === null) {
      unreadableArticleIds.push(id);
      continue;
    }
    for (const key of collectArticleImageStorageKeys(article.content ?? '')) addNeed(needs, key);
    const structured = await port.query<{ id: string; mime_type: string }>(
      `SELECT a.id, a.mime_type FROM node_attachments na JOIN attachments a ON a.id = na.attachment_id
       WHERE na.node_id = ? AND na.role = 'reference' AND a.mime_type = 'application/pdf'`, [id]
    );
    for (const attachment of structured) {
      const key = buildCanonicalAttachmentStorageKey(attachment.id, attachment.mime_type);
      if (key) addNeed(needs, key);
    }
  }
  for (const need of needs.values()) {
    const [row] = await port.query<{ size_bytes: number | null }>('SELECT size_bytes FROM attachments WHERE id = ?', [need.attachmentId]);
    if (row?.size_bytes != null) need.sizeBytes = Math.max(0, row.size_bytes);
  }
  return { needs: [...needs.values()], unreadableArticleIds };
}

function addNeed(needs: Map<string, ArticleAttachmentNeed>, storageKey: string) {
  const parsed = parseCanonicalAttachmentStorageKey(storageKey);
  if (parsed) needs.set(storageKey, { ...parsed, attachmentId: parsed.contentHash });
}
