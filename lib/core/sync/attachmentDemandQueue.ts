import { parseCanonicalAttachmentStorageKey } from '../../platform/attachmentResource.js';
import { recordFramedSyncResourceAvailability } from '../database/framedSyncResourceAvailability.js';
import { parseNodeResourceReferences } from '../database/nodeResourceReferences.js';
import { collectArticleImageStorageKeys } from '../import/replaceArticleImageSource.js';

import type { DbPort } from './dbPort.js';
import type { RequestSyncDatabaseHost } from './requestSyncObjectEndpoint.js';

type Host = Pick<RequestSyncDatabaseHost, 'write' | 'readSnapshot'>;
interface Article extends Record<string, unknown> {
  article_id: string; content: string | null; resource_references: string | null; deleted_at: string | null;
}
interface Need { article: string; source: 'mount' | 'body'; key: string }

/** Bound each bridge read, then drain batches within half the attachment wall budget. */
export async function parseChangedAttachmentArticles(host: Host, shouldYield: () => boolean) {
  const deadline = performance.now() + 1000;
  await host.write(db => db.transaction(async tx => {
    let processed = 0;
    while (true) {
      const rows = await tx.query<Article>(`SELECT q.article_id, n.content, n.resource_references, n.deleted_at
        FROM attachment_parse_queue q LEFT JOIN nodes n ON n.id = q.article_id
        ORDER BY COALESCE(q.attempted_at, q.registered_at), q.article_id LIMIT 128`);
      if (!rows.length) return;
      const ids: string[] = [];
      const needs: Need[] = [];
      for (const row of rows) {
        if (processed > 0 && (shouldYield() || performance.now() >= deadline)) break;
        ids.push(row.article_id);
        needs.push(...articleNeeds(row));
        processed++;
      }
      if (!ids.length) return;
      await replaceBatch(tx, ids, needs);
      if (shouldYield() || performance.now() >= deadline) return;
    }
  }));
}

function articleNeeds(article: Article): Need[] {
  if (article.content === null || article.deleted_at !== null) return [];
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

/** New demand and oldest retries each receive half the slots; unused slots go to the other side. */
export async function selectPendingAttachments(db: DbPort, excluded: readonly string[] = []) {
  const fresh = await db.query<{ storage_key: string }>(`SELECT storage_key FROM attachment_pending
    WHERE attempted_at IS NULL AND storage_key NOT IN (SELECT value FROM json_each(?))
    ORDER BY registered_at, article_id, source, storage_key LIMIT 64`, [JSON.stringify(excluded)]);
  const retries = await db.query<{ storage_key: string }>(`SELECT storage_key FROM attachment_pending
    WHERE attempted_at IS NOT NULL AND storage_key NOT IN (SELECT value FROM json_each(?))
    ORDER BY attempted_at, registered_at, article_id, source, storage_key LIMIT 64`, [JSON.stringify(excluded)]);
  const newCount = Math.min(fresh.length, Math.max(32, 64 - retries.length));
  const selected = [];
  const old = retries.slice(0, 64 - newCount);
  for (let i = 0; i < Math.max(newCount, old.length); i++) {
    if (i < newCount) selected.push(fresh[i]!.storage_key);
    if (i < old.length) selected.push(old[i]!.storage_key);
  }
  return [...new Set(selected)];
}

export async function completeAttachmentDemand(db: DbPort, key: string) {
  await db.run('DELETE FROM attachment_pending WHERE storage_key = ?', [key]);
}

/** A referenced file found missing locally is demanded again through the live articles that mention it. */
export async function requeueMissingAttachmentArticles(db: DbPort, storageKeys: readonly string[]) {
  if (!storageKeys.length) return;
  await db.run(`INSERT INTO attachment_parse_queue(article_id, registered_at)
    SELECT DISTINCT n.id, ? FROM nodes n, json_each(?) key WHERE n.deleted_at IS NULL
      AND (instr(COALESCE(n.content, ''), key.value) > 0 OR instr(COALESCE(n.resource_references, ''), key.value) > 0)
    ON CONFLICT(article_id) DO NOTHING`, [new Date().toISOString(), JSON.stringify(storageKeys)]);
  await recordFramedSyncResourceAvailability(db, storageKeys.map(key => key.slice(0, 64)), false);
}

export async function hasAttachmentDemand(db: DbPort) {
  return (await db.query(`SELECT 1 FROM attachment_parse_queue UNION ALL SELECT 1 FROM attachment_pending LIMIT 1`)).length > 0;
}

export async function recordAttachmentDemandAttempt(db: DbPort, key: string) {
  await db.run('UPDATE attachment_pending SET attempted_at = ? WHERE storage_key = ?', [new Date().toISOString(), key]);
}
