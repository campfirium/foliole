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
  async function* prepared() {
    for await (const publication of publications) {
      const delivery = await prepareDesktopFramedSyncPublishedDelivery({ ...input, publication });
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
    return results;
  } finally { for (const body of bodies) await body.dispose?.(); }
}
