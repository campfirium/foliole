import { parseCanonicalAttachmentStorageKey } from '../../platform/attachmentResource.js';
import { parseNodeResourceReferences } from '../database/nodeResourceReferences.js';
import { collectArticleImageStorageKeys } from '../import/replaceArticleImageSource.js';

import type { ArticleAttachmentNeed } from './articleAttachmentNeeds.js';
import type { DbPort, DbRow } from './dbPort.js';

interface ArticleResources extends DbRow {
  body_hash: string | null;
  content: string | null;
  resource_references: string;
}

/** Demand comes from current contents, never from registry rows or historical versions. */
export async function loadNodeOwnedArticleResourceNeeds(port: DbPort, articleIds: readonly string[]) {
  const needs = new Map<string, ArticleAttachmentNeed>();
  const unreadableArticleIds: string[] = [];
  for (const id of new Set(articleIds)) {
    const [article] = await port.query<ArticleResources>(
      `SELECT body_blob_hash AS body_hash, resource_references, content FROM nodes WHERE id = ?`, [id]
    );
    if (!article) continue;
    for (const reference of parseNodeResourceReferences(article.resource_references)) {
      if (reference.role === 'reference') addNeed(needs, reference.storage_key);
    }
    if (article.body_hash && article.content === null) {
      unreadableArticleIds.push(id);
      continue;
    }
    for (const key of collectArticleImageStorageKeys(article.content ?? '')) addNeed(needs, key);
  }
  return { needs: [...needs.values()], unreadableArticleIds };
}

function addNeed(needs: Map<string, ArticleAttachmentNeed>, storageKey: string) {
  const parsed = parseCanonicalAttachmentStorageKey(storageKey);
  if (parsed) needs.set(storageKey, { ...parsed, attachmentId: parsed.contentHash });
}
