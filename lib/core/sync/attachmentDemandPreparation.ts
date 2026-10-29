import { parseCanonicalAttachmentStorageKey } from '../../platform/attachmentResource.js';
import { parseNodeResourceReferences } from '../database/nodeResourceReferences.js';
import { collectArticleImageStorageKeys } from '../import/replaceArticleImageSource.js';

import type { DbPort } from './dbPort.js';
import type { RequestSyncDatabaseHost } from './requestSyncObjectEndpoint.js';

type Host = Pick<RequestSyncDatabaseHost, 'write' | 'readSnapshot'>;
export interface AttachmentArticle extends Record<string, unknown> {
  article_id: string; id: string | null; content: string | null; resource_references: string | null;
  deleted_at: string | null; current_version_id: string | null; body_blob_hash: string | null;
}
interface Need { article: string; source: 'mount' | 'body'; key: string }
const columns = 'q.article_id, n.id, n.content, n.resource_references, n.deleted_at, n.current_version_id, n.body_blob_hash';

export function readAttachmentArticles(db: DbPort, ids?: readonly string[]) {
  return db.query<AttachmentArticle>(`SELECT ${columns}
    FROM attachment_parse_queue q LEFT JOIN nodes n ON n.id = q.article_id
    ${ids ? 'WHERE q.article_id IN (SELECT value FROM json_each(?))' : ''}
    ORDER BY COALESCE(q.attempted_at, q.registered_at), q.article_id LIMIT 128`, ids ? [JSON.stringify(ids)] : []);
}

/** Snapshot inputs are released before CPU work; late writes validate the complete adopted input again. */
export async function parseChangedAttachmentArticles(host: Host, shouldYield: () => boolean,
  ids?: readonly string[], signal?: AbortSignal) {
  const deadline = performance.now() + 1000;
  let processed = 0;
  for (;;) {
    signal?.throwIfAborted();
    const rows = await host.readSnapshot(db => readAttachmentArticles(db, ids), signal);
    if (!rows.length) return;
    const parsed: { row: AttachmentArticle; needs: Need[] }[] = [];
    for (const row of rows) {
      if (processed > 0 && (shouldYield() || performance.now() >= deadline)) break;
      signal?.throwIfAborted();
      parsed.push({ row, needs: articleNeeds(row) });
      processed++;
    }
    signal?.throwIfAborted();
    if (!parsed.length) return;
    const matched = await host.write(db => db.transaction(async tx => {
      signal?.throwIfAborted();
      const current = new Map((await readAttachmentArticles(tx, parsed.map(value => value.row.article_id)))
        .map(row => [row.article_id, row]));
      const valid = parsed.filter(({ row }) => sameAttachmentArticle(row, current.get(row.article_id)));
      signal?.throwIfAborted();
      if (valid.length) await replaceBatch(tx, valid.map(value => value.row.article_id), valid.flatMap(value => value.needs));
      signal?.throwIfAborted();
      return valid.length;
    }));
    // A stale candidate belongs to the durable queue's next turn, never a retry loop on this input.
    if (ids || matched !== parsed.length || shouldYield() || performance.now() >= deadline) return;
  }
}

export function sameAttachmentArticle(left: AttachmentArticle | undefined, right: AttachmentArticle | undefined) {
  return Boolean(left && right && Object.keys(left).every(key => left[key] === right[key]));
}

function articleNeeds(article: AttachmentArticle): Need[] {
  if (!article.id || article.content === null || article.deleted_at !== null) return [];
  const mounts = parseNodeResourceReferences(article.resource_references ?? '[]')
    .filter(reference => reference.role === 'reference').map(reference => reference.storage_key);
  const body = collectArticleImageStorageKeys(article.content);
  const needs: Need[] = [...new Set(mounts)].map(key => ({ article: article.article_id, source: 'mount', key }));
  needs.push(...[...new Set(body)].map((key): Need => ({ article: article.article_id, source: 'body', key })));
  return needs.filter(need => parseCanonicalAttachmentStorageKey(need.key));
}

async function replaceBatch(db: DbPort, ids: string[], needs: Need[]) {
  const articles = JSON.stringify(ids);
  const wanted = JSON.stringify(needs);
  await db.run(`DELETE FROM attachment_pending WHERE article_id IN (SELECT value FROM json_each(?))
    AND NOT EXISTS (SELECT 1 FROM json_each(?) wanted
      WHERE json_extract(wanted.value, '$.article') = attachment_pending.article_id
        AND json_extract(wanted.value, '$.source') = attachment_pending.source
        AND json_extract(wanted.value, '$.key') = attachment_pending.storage_key)`, [articles, wanted]);
  await db.run(`INSERT INTO attachment_pending(article_id, source, storage_key, registered_at)
    SELECT json_extract(value, '$.article'), json_extract(value, '$.source'), json_extract(value, '$.key'), ?
    FROM json_each(?) WHERE 1 ON CONFLICT(article_id, source, storage_key) DO NOTHING`,
  [new Date().toISOString(), wanted]);
  await db.run('DELETE FROM attachment_parse_queue WHERE article_id IN (SELECT value FROM json_each(?))', [articles]);
}
