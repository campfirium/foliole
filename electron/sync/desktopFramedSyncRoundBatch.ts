import { sameFramedSyncBytes } from '../../lib/core/database/framedSyncStagingSerialization.js';
import type { DbPort } from '../../lib/core/sync/dbPort.js';
import { packFramedSyncTransfers } from '../../lib/core/sync/framedSyncBatchPacking.js';
import type { OutboundPublishInput } from '../../lib/core/sync/framedSyncStagingContract.js';
import type { FramedSyncStagingPort } from '../../lib/core/sync/framedSyncStagingPort.js';

import { sendDesktopFramedSyncBatchWithDependencyRecovery, type DesktopFramedSyncBatchDeliveryResult } from './desktopFramedSyncBatchDependencyRecovery.js';
import { desktopFramedSyncPreparedBatchItem, type DesktopFramedSyncBatchItem } from './desktopFramedSyncPreparedBatchItem.js';
import { prepareDesktopFramedSyncPublishedDelivery } from './desktopFramedSyncProcessOutbound.js';

export async function sendDesktopFramedSyncRoundBatch(input: {
  db: DbPort;
  groupSecret: string;
  peerOrigin: string;
  staging: FramedSyncStagingPort;
}, publications: AsyncIterable<OutboundPublishInput> | readonly OutboundPublishInput[]) {
  const bodies = new Set<DesktopFramedSyncBatchItem['body']>();
  const results: DesktopFramedSyncBatchDeliveryResult[] = [];
  const completed: number[] = [];
  let ordinal = 0;
  async function* prepared() {
    for await (const publication of publications) {
      const index = ordinal++;
      const delivery = await preparePendingDelivery(input, publication);
      if (!delivery) { completed.push(index); continue; }
      bodies.add(delivery.body);
      const item = desktopFramedSyncPreparedBatchItem(publication, delivery);
      yield item;
    }
  }
  try {
    for await (const items of packFramedSyncTransfers(prepared(), item =>
      item.body.uncompressedMessageBytes ?? null)) {
      results.push(...await sendDesktopFramedSyncBatchWithDependencyRecovery(input, items));
      for (const item of items) bodies.delete(item.body);
    }
    for (const index of completed) results.splice(index, 0, { state: 'committed' });
    return results;
  } finally { for (const body of bodies) await body.dispose?.(); }
}

async function preparePendingDelivery(input: Parameters<typeof sendDesktopFramedSyncRoundBatch>[0],
  publication: OutboundPublishInput) {
  try {
    return await prepareDesktopFramedSyncPublishedDelivery({ ...input, publication });
  } catch (error) {
    // A concurrent delivery's verified receipt remains authoritative after its replay payload retires.
    const receipt = await input.staging.loadReceipt(publication.transferId);
    if (!receipt || !sameFramedSyncBytes(receipt.contentId, publication.contentId) ||
        receipt.receiverDeviceId !== publication.context.receiverDeviceId ||
        receipt.receiverLibraryEpoch !== publication.context.receiverLibraryEpoch) throw error;
    return null;
  }
}
