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

export interface ArticleResourceSize extends DbRow {
  id: string;
  bytes: number;
}

const ARTICLE_QUERY_IDS = 128;
// Bound combined body reads to 1 MiB; an individually larger body retains its existing single-row path.
const ARTICLE_QUERY_BYTES = 1024 * 1024;
// Bodies without an asset URL cannot yield an image key (collectArticleImageStorageKeys returns early),
// so they cross the database boundary as '' instead of their full text. A byte search has no false
// negatives, and NULL stays NULL so an unreadable body is still reported.
const HAS_ASSET_URL = `instr(CAST(content AS BLOB), CAST('asset://' AS BLOB)) > 0`;
const RESOURCE_CONTENT = `CASE WHEN content IS NULL THEN NULL WHEN ${HAS_ASSET_URL} THEN content ELSE '' END`;
const RESOURCE_BYTES = `COALESCE(length(CAST(${RESOURCE_CONTENT} AS BLOB)), 0)
  + length(CAST(resource_references AS BLOB))`;
// Only these nodes can yield a key: an asset URL in the body, mounted files, or an unreadable body to report.
const RESOURCE_CANDIDATE = `content IS NULL OR ${HAS_ASSET_URL} OR resource_references IS NOT '[]'`;

/** Every node that can hold a reference, with the bytes its resource read would transfer, in id order. */
export function listArticleResourceCandidates(port: DbPort) {
  return port.query<ArticleResourceSize>(`SELECT id, ${RESOURCE_BYTES} AS bytes FROM nodes
    WHERE ${RESOURCE_CANDIDATE} ORDER BY id`);
}

/** Mounted files of every available text alternative of an existing node. */
export async function loadLibraryAlternativeResourceNeeds(port: DbPort) {
  const needs = new Map<string, ArticleAttachmentNeed>();
  const choices = await port.query<{ resource_references: string }>(`SELECT resource_references
    FROM node_text_alternatives WHERE status = 'available' AND resource_references IS NOT '[]'
      AND node_id IN (SELECT id FROM nodes)`);
  for (const choice of choices) for (const reference of parseNodeResourceReferences(choice.resource_references)) {
    addNeed(needs, reference.storage_key);
  }
  return [...needs.values()];
}

/** Groups sized ids into reads of at most 128 ids and 1 MiB; a larger single body stays alone. */
export function* batchArticleResourceIds(sizes: Iterable<ArticleResourceSize>, maxIds = ARTICLE_QUERY_IDS) {
  let batch: string[] = [];
  let bytes = 0;
  for (const { id, bytes: size } of sizes) {
    if (batch.length && (batch.length >= maxIds || bytes + size > ARTICLE_QUERY_BYTES)) {
      yield batch;
      batch = [];
      bytes = 0;
    }
    batch.push(id);
    bytes += size;
  }
  if (batch.length) yield batch;
}

async function* readArticles(port: DbPort, articleIds: readonly string[]) {
  const ids = [...new Set(articleIds)];
  for (let offset = 0; offset < ids.length; offset += ARTICLE_QUERY_IDS) {
    const chunk = ids.slice(offset, offset + ARTICLE_QUERY_IDS);
    const sizes = await port.query<ArticleResourceSize>(`SELECT id, ${RESOURCE_BYTES} AS bytes
      FROM nodes WHERE id IN (${chunk.map(() => '?').join(',')})`, chunk);
    const byId = new Map(sizes.map(row => [row.id, row.bytes]));
    const present = chunk.flatMap(id => byId.has(id) ? [{ id, bytes: byId.get(id)! }] : []);
    for (const batch of batchArticleResourceIds(present)) yield* readArticleBatch(port, batch);
  }
}

async function* readArticleBatch(port: DbPort, ids: readonly string[]) {
  const rows = await port.query<ArticleResources>(`SELECT id, body_blob_hash AS body_hash,
    resource_references, ${RESOURCE_CONTENT} AS content FROM nodes WHERE id IN (${ids.map(() => '?').join(',')})`, [...ids]);
  const byId = new Map(rows.map(row => [row.id, row]));
  for (const id of ids) {
    const row = byId.get(id);
    if (row) yield row;
  }
}

/** Demand comes from current contents, never from registry rows or historical versions. */
export function loadNodeOwnedArticleResourceNeeds(port: DbPort, articleIds: readonly string[]) {
  return collectNeeds(port, readArticles(port, articleIds), articleIds);
}

/**
 * loadNodeOwnedArticleResourceNeeds for ids already grouped by batchArticleResourceIds, without re-reading
 * their sizes and without text alternatives: a whole-library caller reads those once with
 * loadLibraryAlternativeResourceNeeds.
 */
export function loadSizedArticleResourceNeeds(port: DbPort, batch: readonly string[]) {
  if (batch.length > ARTICLE_QUERY_IDS) throw new Error('attachment_scan_batch_invalid');
  return collectNeeds(port, readArticleBatch(port, batch), []);
}

async function collectNeeds(port: DbPort, articles: AsyncIterable<ArticleResources>,
  alternativeNodeIds: readonly string[]) {
  const needs = new Map<string, ArticleAttachmentNeed>();
  const unreadableArticleIds: string[] = [];
  for await (const article of articles) {
    for (const reference of parseNodeResourceReferences(article.resource_references)) {
      if (reference.role === 'reference') addNeed(needs, reference.storage_key);
    }
    if (article.body_hash && article.content === null) {
      unreadableArticleIds.push(article.id);
      continue;
    }
    for (const key of collectArticleImageStorageKeys(article.content ?? '')) addNeed(needs, key);
  }
  for (let offset = 0; offset < alternativeNodeIds.length; offset += ARTICLE_QUERY_IDS) {
    const choices = await port.query<{ resource_references: string }>(`SELECT resource_references
      FROM node_text_alternatives WHERE node_id IN (SELECT value FROM json_each(?)) AND status = 'available'`,
    [JSON.stringify(alternativeNodeIds.slice(offset, offset + ARTICLE_QUERY_IDS))]);
    for (const choice of choices) for (const reference of parseNodeResourceReferences(choice.resource_references)) {
      addNeed(needs, reference.storage_key);
    }
  }
  return { needs: [...needs.values()], unreadableArticleIds };
}

function addNeed(needs: Map<string, ArticleAttachmentNeed>, storageKey: string) {
  const parsed = parseCanonicalAttachmentStorageKey(storageKey);
  if (parsed) needs.set(storageKey, { ...parsed, attachmentId: parsed.contentHash });
}
