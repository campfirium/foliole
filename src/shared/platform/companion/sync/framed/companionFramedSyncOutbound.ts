import type { DbPort } from '../../../../../../lib/core/sync/dbPort.js';
import { canonicalContentId, canonicalTransferId } from '../../../../../../lib/core/sync/framedSyncCanonicalManifest.js';
import { createCompanionFramedSyncOutboundValue } from '../../../../../../lib/core/sync/framedSyncCompanionOutboundContract.js';
import { FRAMED_SYNC_PROTOCOL_VERSION, type FramedSyncContext } from '../../../../../../lib/core/sync/framedSyncContract.js';
import { projectFramedSyncNodeRecord } from '../../../../../../lib/core/sync/framedSyncNodeProjection.js';
import { createFramedSyncOutboundStaging } from '../../../../../../lib/core/sync/framedSyncOutboundStaging.js';
import { encodeValidatedProtocolMessage } from '../../../../../../lib/core/sync/framedSyncProtocolCodec.js';
import { factToWire } from '../../../../../../lib/core/sync/framedSyncWireProjection.js';
import { loadCurrentSyncNodeRecord } from '../../../../../../lib/core/sync/syncNodeGraph.js';

function requiredText(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) throw new Error('sync_group_data_text_required');
  return value.trim();
}

function context(payload: Record<string, unknown>): FramedSyncContext {
  return {
    groupId: requiredText(payload.group_id),
    protocolVersion: FRAMED_SYNC_PROTOCOL_VERSION,
    receiverDeviceId: requiredText(payload.receiver_device_id),
    receiverLibraryEpoch: requiredText(payload.receiver_library_epoch),
    senderDeviceId: requiredText(payload.sender_device_id),
    senderLibraryEpoch: requiredText(payload.sender_library_epoch)
  };
}

/** Freeze one current node version and return the host-neutral bytes needed by a native sender. */
export async function prepareCompanionFramedSyncOutbound(
  db: DbPort,
  payload: Record<string, unknown>
) {
  const record = await loadCurrentSyncNodeRecord(db, requiredText(payload.object_id));
  if (!record) throw new Error('framed_sync_source_empty');
  const projection = projectFramedSyncNodeRecord(record);
  const transferContext = context(payload);
  const contentId = await canonicalContentId(projection.manifest);
  const transferId = await canonicalTransferId(transferContext, contentId);
  const state = await createFramedSyncOutboundStaging(db).publishOutbound({
    contentId, context: transferContext, manifest: projection.manifest,
    manifestHash: contentId, transferId
  });
  const blob = projection.manifest.blobs[0]!;
  const fact = projection.manifest.facts[0]!;
  return createCompanionFramedSyncOutboundValue({
    blob,
    contentId,
    dataText: record.body_text ?? '',
    factMessageBytes: encodeValidatedProtocolMessage('fact', factToWire(fact)),
    manifestHash: contentId,
    publicationState: state,
    transferId
  });
}
