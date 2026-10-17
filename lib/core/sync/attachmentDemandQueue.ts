import { parseCanonicalAttachmentStorageKey } from '../../platform/attachmentResource.js';
import { parseNodeResourceReferences } from '../database/nodeResourceReferences.js';
import { collectArticleImageStorageKeys } from '../import/replaceArticleImageSource.js';

import type { DbPort } from './dbPort.js';
import type { RequestSyncDatabaseHost } from './requestSyncObjectEndpoint.js';

type Host = Pick<RequestSyncDatabaseHost, 'write' | 'readSnapshot'>;
interface Article extends Record<string, unknown> {
  content: string | null; body_blob_hash: string | null; resource_references: string; deleted_at: string | null;
}

/** Reserve half the existing wall budget and bound bridge transactions even for tiny bodies. */
export async function parseChangedAttachmentArticles(host: Host, shouldYield: () => boolean) {
  const deadline = performance.now() + 1000;
  const rows = await host.readSnapshot(db => db.query<{ article_id: string }>(`SELECT article_id
    FROM attachment_parse_queue ORDER BY COALESCE(attempted_at, registered_at), article_id LIMIT 64`));
  let processed = 0;
  for (const row of rows) {
    if (processed > 0 && (shouldYield() || performance.now() >= deadline)) break;
    processed++;
    await host.write(db => db.transaction(tx => parseArticle(tx, row.article_id)));
  }
}

async function parseArticle(db: DbPort, id: string) {
  const [queued] = await db.query('SELECT 1 FROM attachment_parse_queue WHERE article_id = ?', [id]);
  if (!queued) return;
  const [article] = await db.query<Article>(`SELECT content, body_blob_hash, resource_references, deleted_at
    FROM nodes WHERE id = ?`, [id]);
  if (!article || article.deleted_at !== null) {
    await db.run('DELETE FROM attachment_pending WHERE article_id = ?', [id]);
  } else {
    const mounts = parseNodeResourceReferences(article.resource_references)
      .filter(reference => reference.role === 'reference').map(reference => reference.storage_key);
    await replaceNeeds(db, id, 'mount', mounts);
    if (article.body_blob_hash && article.content === null) {
      await db.run('UPDATE attachment_parse_queue SET attempted_at = ? WHERE article_id = ?', [new Date().toISOString(), id]);
      return;
    }
    await replaceNeeds(db, id, 'body', collectArticleImageStorageKeys(article.content ?? ''));
  }
  await db.run('DELETE FROM attachment_parse_queue WHERE article_id = ?', [id]);
}

async function replaceNeeds(db: DbPort, id: string, source: 'mount' | 'body', keys: readonly string[]) {
  const wanted = new Set(keys.filter(key => parseCanonicalAttachmentStorageKey(key)));
  const old = await db.query<{ storage_key: string }>(
    'SELECT storage_key FROM attachment_pending WHERE article_id = ? AND source = ?', [id, source]);
  for (const row of old) if (!wanted.has(row.storage_key)) await db.run(
    'DELETE FROM attachment_pending WHERE article_id = ? AND source = ? AND storage_key = ?', [id, source, row.storage_key]);
  const now = new Date().toISOString();
  for (const key of wanted) await db.run(`INSERT INTO attachment_pending(article_id, source, storage_key, registered_at)
    VALUES (?, ?, ?, ?) ON CONFLICT(article_id, source, storage_key) DO NOTHING`, [id, source, key, now]);
}

/** New demand and oldest retries each receive half the slots; unused slots go to the other side. */
export async function selectPendingAttachments(db: DbPort) {
  const fresh = await db.query<{ storage_key: string }>(`SELECT storage_key FROM attachment_pending
    WHERE attempted_at IS NULL ORDER BY registered_at, article_id, source, storage_key LIMIT 64`);
  const retries = await db.query<{ storage_key: string }>(`SELECT storage_key FROM attachment_pending
    WHERE attempted_at IS NOT NULL ORDER BY attempted_at, registered_at, article_id, source, storage_key LIMIT 64`);
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

export async function hasAttachmentDemand(db: DbPort) {
  return (await db.query(`SELECT 1 FROM attachment_parse_queue UNION ALL SELECT 1 FROM attachment_pending LIMIT 1`)).length > 0;
}

export async function recordAttachmentDemandAttempt(db: DbPort, key: string) {
  await db.run('UPDATE attachment_pending SET attempted_at = ? WHERE storage_key = ?', [new Date().toISOString(), key]);
}
