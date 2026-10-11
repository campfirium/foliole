import { bytesToHex } from '@noble/hashes/utils.js';

import { assertRequiredBlobsAvailable, isBodyDescriptor } from './framedSyncBlobContract.js';
import { loadFramedSyncFilePins } from './framedSyncFileBlobRecords.js';
import { loadFramedSyncFileInboundBody } from './framedSyncFileInboundBodies.js';
import { framedSyncInboundAttemptDirectory, framedSyncInboundDirectory,
  requireFramedSyncFileInbound, writeFramedSyncFileInbound } from './framedSyncFileInboundRecord.js';
import type { FramedSyncFilePort } from './framedSyncFilePort.js';
import { FRAMED_SYNC_RESOURCE_FACT_KIND } from './framedSyncResourceFact.js';

export async function markFramedSyncFileReady(files: FramedSyncFilePort, transferId: Uint8Array) {
  await files.exclusive(framedSyncInboundDirectory(transferId), async () => {
    const record = await requireFramedSyncFileInbound(files, transferId);
    if (!record.header || !record.verifiedManifest || record.state !== 'receiving') throw new Error('inbound_transfer_not_receiving');
    const pins = await loadFramedSyncFilePins(files, transferId);
    assertRequiredBlobsAvailable(transferId, record.header.blobs.filter((blob) => blob.required),
      pins.map((pin) => ({ ...pin, transferId, durable: true, verified: true })));
    for (const pin of pins) {
      if (isBodyDescriptor(pin)) await loadFramedSyncFileInboundBody(files, { transferId, attemptId: record.header.attemptId }, pin);
      else if (!pin.storageKey) throw new Error('resource_blob_storage_key_invalid');
    }
    await writeFramedSyncFileInbound(files, { ...record, state: 'ready_to_apply' });
  });
}

export async function releaseFramedSyncFilePins(files: FramedSyncFilePort, transferId: Uint8Array,
  reason: 'business_reference_committed' | 'termination_acknowledged') {
  await files.exclusive(framedSyncInboundDirectory(transferId), async () => {
    const record = await requireFramedSyncFileInbound(files, transferId);
    if (reason === 'business_reference_committed') {
      if (record.state !== 'applied' || !record.receipt) throw new Error('applied_transfer_required_for_pin_release');
      if (record.header?.facts.some((fact) => fact.kind === FRAMED_SYNC_RESOURCE_FACT_KIND) && !record.resourceDemandsCompleted) {
        throw new Error('resource_demand_completion_required_for_pin_release');
      }
    } else if (!await files.read(`termination/${bytesToHex(transferId)}/ack.json`)) {
      throw new Error('termination_ack_required_for_pin_release');
    }
    if (record.header) {
      await files.remove(framedSyncInboundAttemptDirectory(transferId, record.header.attemptId));
    }
  });
}
