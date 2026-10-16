import { parseCanonicalAttachmentStorageKey } from '../../platform/attachmentResource.js';
import { parseNodeResourceReferences } from '../database/nodeResourceReferences.js';
import { collectArticleImageStorageKeys } from '../import/replaceArticleImageSource.js';

import type { ArticleAttachmentNeed } from './articleAttachmentNeeds.js';
import type { DbPort, DbRow } from './dbPort.js';

interface ArticleResources extends DbRow {
  id: string;
  body_hash: string | null;
  content: string | null;
  resource_references: string;
}

const ARTICLE_QUERY_IDS = 128;
// Bound combined body reads to 1 MiB; an individually larger body retains its existing single-row path.
const ARTICLE_QUERY_BYTES = 1024 * 1024;

async function* readArticles(port: DbPort, articleIds: readonly string[]) {
  const ids = [...new Set(articleIds)];
  for (let offset = 0; offset < ids.length; offset += ARTICLE_QUERY_IDS) {
    const chunk = ids.slice(offset, offset + ARTICLE_QUERY_IDS);
    const sizes = await port.query<{ id: string; bytes: number }>(`SELECT id,
      COALESCE(length(CAST(content AS BLOB)), 0) + length(CAST(resource_references AS BLOB)) AS bytes
      FROM nodes WHERE id IN (${chunk.map(() => '?').join(',')})`, chunk);
    const byId = new Map(sizes.map(row => [row.id, row.bytes]));
    let batch: string[] = [];
    let bytes = 0;
    for (const id of chunk) {
      const size = byId.get(id);
      if (size === undefined) continue;
      if (batch.length && bytes + size > ARTICLE_QUERY_BYTES) {
        yield* readArticleBatch(port, batch);
        batch = [];
        bytes = 0;
      }
      batch.push(id);
      bytes += size;
    }
    if (batch.length) yield* readArticleBatch(port, batch);
  }
}

async function* readArticleBatch(port: DbPort, ids: string[]) {
  const rows = await port.query<ArticleResources>(`SELECT id, body_blob_hash AS body_hash,
    resource_references, content FROM nodes WHERE id IN (${ids.map(() => '?').join(',')})`, ids);
  const byId = new Map(rows.map(row => [row.id, row]));
  for (const id of ids) {
    const row = byId.get(id);
    if (row) yield row;
  }
}

/** Demand comes from current contents, never from registry rows or historical versions. */
export async function loadNodeOwnedArticleResourceNeeds(port: DbPort, articleIds: readonly string[]) {
  const needs = new Map<string, ArticleAttachmentNeed>();
  const unreadableArticleIds: string[] = [];
  for await (const article of readArticles(port, articleIds)) {
    for (const reference of parseNodeResourceReferences(article.resource_references)) {
      if (reference.role === 'reference') addNeed(needs, reference.storage_key);
    }
    if (article.body_hash && article.content === null) {
      unreadableArticleIds.push(article.id);
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
