import { recordFramedSyncResourceAvailability } from '../database/framedSyncResourceAvailability.js';

import { hasAttachmentDemand, parseChangedAttachmentArticles, selectPendingAttachments } from './attachmentDemandQueue.js';
import { attachmentWorkBudget } from './attachmentWorkBudget.js';
import { missingPdfTextArtifacts } from './pdfTextArtifact.js';
import type { RequestSyncDatabaseHost } from './requestSyncObjectEndpoint.js';

export const ATTACHMENT_STAT_BATCH_COUNT = 64;
export const ATTACHMENT_STAT_BATCH_BYTES = 16 * 1024;

export function* attachmentStatBatches(keys: readonly string[]) {
  let batch: string[] = [];
  let bytes = 0;
  for (const key of keys) {
    const size = new TextEncoder().encode(key).length;
    if (size > ATTACHMENT_STAT_BATCH_BYTES) throw new Error('attachment_stat_key_too_large');
    if (batch.length && (batch.length === ATTACHMENT_STAT_BATCH_COUNT || bytes + size > ATTACHMENT_STAT_BATCH_BYTES)) {
      yield batch;
      batch = [];
      bytes = 0;
    }
    batch.push(key);
    bytes += size;
  }
  if (batch.length) yield batch;
}

/** Both request directions consume the same durable, bounded demand. */
export async function readRequestSyncAttachmentNeeds(host: Pick<RequestSyncDatabaseHost, 'readSnapshot' | 'write'>,
  inspect: (storageKeys: string[]) => Promise<boolean[]>) {
  return (await readRequestSyncAttachmentNeedsSlice(host, inspect, attachmentWorkBudget())).keys;
}

export async function readRequestSyncAttachmentNeedsSlice(host: Pick<RequestSyncDatabaseHost, 'readSnapshot' | 'write'>,
  inspect: (storageKeys: string[]) => Promise<boolean[]>, shouldYield: () => boolean, requirePdfText = false, limit = 64) {
  if (!await host.readSnapshot(hasAttachmentDemand)) return { keys: [], pdfTextKeys: [], pending: false };
  await parseChangedAttachmentArticles(host, shouldYield);
  const parsingPending = await host.readSnapshot(async db =>
    (await db.query('SELECT 1 FROM attachment_parse_queue LIMIT 1')).length > 0);
  const keys = await host.readSnapshot(db => selectPendingAttachments(db, limit));
  if (!keys.length) return { keys: [], pdfTextKeys: [], pending: await host.readSnapshot(hasAttachmentDemand), parsingPending };
  const pdfTextKeys = requirePdfText ? await host.readSnapshot(db => missingPdfTextArtifacts(db, keys)) : [];
  const missing = await inspectAttachmentNeeds(host, keys, inspect);
  const retained = new Set([...missing, ...pdfTextKeys]);
  const completed = keys.filter(key => !retained.has(key));
  await host.write(db => db.transaction(async tx => {
    if (completed.length) {
      await tx.run('DELETE FROM attachment_pending WHERE storage_key IN (SELECT value FROM json_each(?))',
        [JSON.stringify(completed)]);
    }
  }));
  // Selected missing files are reported separately by the exchange; pending means work beyond this slice.
  const pending = await host.readSnapshot(async db => {
    const [queued] = await db.query('SELECT 1 FROM attachment_parse_queue LIMIT 1');
    const [remaining] = await db.query(`SELECT 1 FROM attachment_pending
      WHERE storage_key NOT IN (${keys.map(() => '?').join(',')}) LIMIT 1`, keys);
    return Boolean(queued || remaining);
  });
  return { keys: missing, pdfTextKeys, pending, parsingPending };
}

export async function inspectAttachmentNeeds(host: Pick<RequestSyncDatabaseHost, 'write'>, resources: readonly string[],
  inspect: (keys: string[]) => Promise<boolean[]>) {
  const missing: string[] = [];
  for (const keys of attachmentStatBatches(resources)) {
    const presence = await inspect(keys);
    if (presence.length !== keys.length || presence.some(value => typeof value !== 'boolean')) {
      throw new Error('attachment_stat_response_invalid');
    }
    await host.write(db => db.transaction(async tx => {
      await recordFramedSyncResourceAvailability(tx, keys.filter((_, i) => presence[i]).map(key => key.slice(0, 64)), true);
      await recordFramedSyncResourceAvailability(tx, keys.filter((_, i) => !presence[i]).map(key => key.slice(0, 64)), false);
    }));
    keys.forEach((key, i) => { if (!presence[i]) missing.push(key); });
  }
  return missing;
}
