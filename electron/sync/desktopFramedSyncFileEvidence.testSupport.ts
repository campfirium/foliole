import { hexToBytes } from '@noble/hashes/utils.js';

import { loadFramedSyncFilePins } from '../../lib/core/sync/framedSyncFileBlobRecords.js';
import { framedSyncInboundAttemptDirectory, readFramedSyncFileInbound } from '../../lib/core/sync/framedSyncFileInboundRecord.js';
import { loadFramedSyncFileTask } from '../../lib/core/sync/framedSyncFilePublication.js';

import { createDesktopLibrarySyncFiles } from './desktopFramedSyncFiles.js';

export async function filePublicationEvidence(databasePath: string) {
  const files = createDesktopLibrarySyncFiles(databasePath);
  const publications = [];
  const receipts: { id: string; receiver_device_id: string }[] = [];
  const inboundStates: { state: string }[] = [];
  const attempts: string[] = [];
  const frames: string[] = [];
  for (const id of await files.list('outbound')) {
    const task = await loadFramedSyncFileTask(files, hexToBytes(id));
    if (!task) continue;
    publications.push({ ...task, id });
    if (task.receipt) receipts.push({ id, receiver_device_id: task.receipt.receiverDeviceId });
    for (const attempt of await files.list(`attempts/${id}/transfer`)) {
      const directory = `attempts/${id}/transfer/${attempt}`;
      attempts.push(directory);
      frames.push(...(await files.list(directory)).filter(name => name !== 'attempt.json'));
    }
  }
  for (const id of await files.list('inbound')) {
    const inbound = await readFramedSyncFileInbound(files, hexToBytes(id));
    if (!inbound) continue;
    inboundStates.push({ state: inbound.state });
    if (inbound.receipt) receipts.push({ id, receiver_device_id: inbound.receipt.receiverDeviceId });
  }
  const holds = publications.filter(task => task.state !== 'retired')
    .map(task => ({ member_id: task.context.receiverDeviceId })).sort((a, b) => a.member_id.localeCompare(b.member_id));
  return { publications, receipts, holds, inboundStates, attempts, frames };
}

export async function fileInboundEvidence(databasePath: string) {
  const files = createDesktopLibrarySyncFiles(databasePath);
  const evidence = [];
  for (const id of [...await files.list('inbound')].sort()) {
    const transferId = hexToBytes(id);
    const record = await readFramedSyncFileInbound(files, transferId);
    if (!record) continue;
    const attempt = record.header && framedSyncInboundAttemptDirectory(transferId, record.header.attemptId);
    evidence.push({ id, state: record.state, receipt: record.receipt,
      verifiedManifest: record.verifiedManifest, facts: record.header?.facts ?? [],
      pins: await loadFramedSyncFilePins(files, transferId),
      attemptEntries: attempt ? [...await files.list(attempt)].sort() : [],
      bodies: attempt ? [...await files.list(`${attempt}/bodies`)].sort() : [] });
  }
  return evidence;
}
