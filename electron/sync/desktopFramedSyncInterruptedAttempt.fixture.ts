import type { DbPort } from '../../lib/core/sync/dbPort.js';
import { FRAMED_SYNC_FRAME_TYPES } from '../../lib/core/sync/framedSyncContract.js';
import type { OutboundPublishInput } from '../../lib/core/sync/framedSyncStagingContract.js';
import type { FramedSyncStagingPort } from '../../lib/core/sync/framedSyncStagingPort.js';
import { manifestToWire } from '../../lib/core/sync/framedSyncWireProjection.js';

import { prepareDesktopFramedSyncPublishedTransfer } from './desktopFramedSyncProcessOutbound.js';
import { encryptProtocolFrame, newTransferAttempt } from './desktopFramedSyncProcessWire.js';

export async function prepareInterruptedDesktopFramedSyncAttempt(input: {
  db: DbPort;
  groupSecret: string;
  mode: 'finalised' | 'partial';
  publication: OutboundPublishInput;
  staging: FramedSyncStagingPort;
}) {
  if (input.mode === 'finalised') return prepareDesktopFramedSyncPublishedTransfer(input);
  const attempt = newTransferAttempt(input.publication.transferId);
  await input.staging.persistOutboundAttempt(input.publication.transferId, attempt);
  const frame = await encryptProtocolFrame({
    attempt, frameType: FRAMED_SYNC_FRAME_TYPES.transferHeader,
    groupKey: new Uint8Array(Buffer.from(input.groupSecret, 'base64url')),
    payload: { attemptId: attempt.attemptId, transferId: input.publication.transferId,
      manifest: manifestToWire(input.publication.manifest, input.publication.context.groupId,
        input.publication.contentId) },
    payloadCase: 'transfer_header', sequence: 0n, transferId: input.publication.transferId
  });
  await input.staging.commitOutboundFrame(input.publication.transferId, attempt.attemptId, frame);
  return attempt;
}
