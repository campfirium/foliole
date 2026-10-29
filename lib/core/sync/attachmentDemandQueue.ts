import { recordFramedSyncResourceAvailability } from '../database/framedSyncResourceAvailability.js';

import type { DbPort } from './dbPort.js';
export { parseChangedAttachmentArticles } from './attachmentDemandPreparation.js';

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
