import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';

import { FRAMED_SYNC_RECEIPT_RETENTION_MS } from './framedSyncCompletionRetention.js';
import { finishFramedSyncFileCompletion } from './framedSyncFileCompletion.js';
import { framedSyncInboundDirectory, readFramedSyncFileInbound } from './framedSyncFileInboundRecord.js';
import { releaseFramedSyncFilePublication } from './framedSyncFileOutbound.js';
import type { FramedSyncFilePort } from './framedSyncFilePort.js';
import { framedSyncPublicationDirectory, loadFramedSyncFileTask } from './framedSyncFilePublication.js';

function transferId(id: string) {
  if (!/^[a-f0-9]{64}$/u.test(id)) throw new Error('framed_sync_completion_identity_invalid');
  return hexToBytes(id);
}

/** The established seven-day window only applies after confirmation and payload release. */
export async function expireFramedSyncFileCompletions(files: FramedSyncFilePort, now = Date.now()) {
  let removed = 0;
  const before = now - FRAMED_SYNC_RECEIPT_RETENTION_MS;
  for (const name of await files.list('outbound')) {
    const id = transferId(name);
    await files.exclusive(`receiver/${name}`, async () => {
      const task = await loadFramedSyncFileTask(files, id);
      if (!task || task.state === 'published') return;
      await releaseFramedSyncFilePublication(files, id);
      if (task.completedAt === undefined || task.completedAt >= before) return;
      await files.exclusive(framedSyncPublicationDirectory(id), async () => {
        const current = await loadFramedSyncFileTask(files, id);
        if (!current || current.state !== 'retired' || current.completedAt === undefined || current.completedAt >= before) return;
        await files.remove(`attempts/${bytesToHex(id)}`);
        await files.remove(framedSyncPublicationDirectory(id));
        removed += 1;
      });
    });
  }
  for (const name of await files.list('inbound')) {
    const id = transferId(name);
    await files.exclusive(`receiver/${name}`, async () => {
      const record = await readFramedSyncFileInbound(files, id);
      if (!record?.receipt || record.state !== 'applied') return;
      await finishFramedSyncFileCompletion(files, id);
      if (record.completedAt === undefined || record.completedAt >= before) return;
      await files.exclusive(framedSyncInboundDirectory(id), async () => {
        await files.remove(`attempts/${name}/receipt`);
        await files.remove(framedSyncInboundDirectory(id));
        removed += 1;
      });
    });
  }
  return removed;
}
