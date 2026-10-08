import { readFramedSyncMissingDependency } from '../../lib/core/sync/framedSyncInventoryRoundDelivery.js';

import type { DesktopFramedSyncBatchItem } from './desktopFramedSyncPreparedBatchItem.js';
import { prepareDesktopFramedSyncPublishedDelivery, sendDesktopFramedSyncPublishedTransfer } from './desktopFramedSyncProcessOutbound.js';
import { sendDesktopFramedSyncPublishedBatch } from './desktopFramedSyncPublishedBatch.js';

type Input = Omit<Parameters<typeof sendDesktopFramedSyncPublishedBatch>[0], 'items'>;
export type DesktopFramedSyncBatchDeliveryResult =
  | Readonly<{ state: 'committed' | 'pending' }>
  | Readonly<{ state: 'deferred'; error: unknown }>;

/** Dependency failures belong to original units; unrelated failures keep their original behavior. */
export async function sendDesktopFramedSyncBatchWithDependencyRecovery(input: Input,
  items: readonly DesktopFramedSyncBatchItem[]): Promise<DesktopFramedSyncBatchDeliveryResult[]> {
  try {
    if (items.length === 1) await sendIndividual(input, items[0]!);
    else await sendDesktopFramedSyncPublishedBatch({ ...input, items });
    return Promise.all(items.map(item => receiptState(input, item)));
  } catch (error) {
    if (!readFramedSyncMissingDependency(error)) throw error;
    if (items.length === 1) return [{ state: 'deferred', error }];
    const results: DesktopFramedSyncBatchDeliveryResult[] = [];
    for (const item of items) results.push(await recoverIndividual(input, item));
    return results;
  }
}

async function recoverIndividual(input: Input, item: DesktopFramedSyncBatchItem): Promise<DesktopFramedSyncBatchDeliveryResult> {
  if (await input.staging.loadReceipt(item.published.transferId)) return { state: 'committed' };
  try {
    const publication = await loadPublication(input, item);
    const delivery = await prepareDesktopFramedSyncPublishedDelivery({ ...input, publication });
    await sendDesktopFramedSyncPublishedTransfer({ ...input, publication, ...delivery });
    return receiptState(input, item);
  } catch (error) {
    if (!readFramedSyncMissingDependency(error)) throw error;
    return { state: 'deferred', error };
  }
}

async function sendIndividual(input: Input, item: DesktopFramedSyncBatchItem) {
  const publication = await loadPublication(input, item);
  await sendDesktopFramedSyncPublishedTransfer({ ...input, publication, attempt: item.attempt, body: item.body });
}

async function loadPublication(input: Input, item: DesktopFramedSyncBatchItem) {
  const publication = await input.staging.loadOutboundPublication(item.published.transferId);
  if (!publication) throw new Error('framed_sync_outbound_publication_missing');
  return publication;
}

async function receiptState(input: Input, item: DesktopFramedSyncBatchItem): Promise<DesktopFramedSyncBatchDeliveryResult> {
  return { state: await input.staging.loadReceipt(item.published.transferId) ? 'committed' : 'pending' };
}
