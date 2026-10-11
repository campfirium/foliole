import { createFramedSyncFileAdmission } from './framedSyncFileAdmission.js';
import { createFramedSyncFileBodyStaging } from './framedSyncFileBodyStaging.js';
import { createFramedSyncFileInboundFacts } from './framedSyncFileInboundFacts.js';
import { finalizeFramedSyncFileInbound } from './framedSyncFileInboundFinalize.js';
import { createFramedSyncFileInboundFrames } from './framedSyncFileInboundFrames.js';
import { markFramedSyncFileReady, releaseFramedSyncFilePins } from './framedSyncFileInboundLifecycle.js';
import { createFramedSyncFileOutboundStaging } from './framedSyncFileOutbound.js';
import type { FramedSyncFilePort } from './framedSyncFilePort.js';
import { createFramedSyncFileReceiptStaging } from './framedSyncFileReceipt.js';
import { createFramedSyncFileResourceStaging } from './framedSyncFileResourceStaging.js';
import { createFramedSyncFileTermination } from './framedSyncFileTermination.js';
import type { InboundFinalizeInput } from './framedSyncStagingContract.js';
import type { FramedSyncStagingPort } from './framedSyncStagingPort.js';

export function createFramedSyncFileStaging(files: FramedSyncFilePort) {
  return {
    ...createFramedSyncFileAdmission(files),
    ...createFramedSyncFileBodyStaging(files),
    ...createFramedSyncFileInboundFrames(files),
    ...createFramedSyncFileInboundFacts(files),
    ...createFramedSyncFileOutboundStaging(files),
    ...createFramedSyncFileReceiptStaging(files),
    ...createFramedSyncFileResourceStaging(files),
    ...createFramedSyncFileTermination(files),
    finalizeInboundAttempt: (input: InboundFinalizeInput) => finalizeFramedSyncFileInbound(files, input),
    markReadyToApply: (transferId: Uint8Array) => markFramedSyncFileReady(files, transferId),
    releasePins: (transferId: Uint8Array, reason: Parameters<FramedSyncStagingPort['releasePins']>[1]) =>
      releaseFramedSyncFilePins(files, transferId, reason)
  } satisfies FramedSyncStagingPort & {
    compactBodyFrame: ReturnType<typeof createFramedSyncFileInboundFrames>['compactBodyFrame'];
    persistTerminationRequest: ReturnType<typeof createFramedSyncFileTermination>['persistTerminationRequest'];
    listReplayableAttempts: ReturnType<typeof createFramedSyncFileOutboundStaging>['listReplayableAttempts'];
  };
}
