import type { PreparedTransferAttempt } from '../../lib/core/sync/framedSyncContract.js';
import type { OutboundPublishInput } from '../../lib/core/sync/framedSyncStagingContract.js';
import type { FramedSyncStagingPort } from '../../lib/core/sync/framedSyncStagingPort.js';

import { processFrameStream } from './desktopFramedSyncProcessWire.js';
import { framedSyncEncodedLength, framedSyncEncodedSha256 } from './desktopFramedSyncStream.js';

export async function loadDesktopFramedSyncPreparedTransferBody(input: {
  attempt: PreparedTransferAttempt;
  publication: OutboundPublishInput;
  staging: FramedSyncStagingPort;
}) {
  const frames = await input.staging.loadReplayableFrames(
    input.publication.transferId,
    input.attempt.attemptId
  );
  return {
    bodySha256: framedSyncEncodedSha256(input.attempt.preamble, frames),
    contentLength: framedSyncEncodedLength(input.attempt.preamble, frames),
    frames: processFrameStream(frames),
    preamble: input.attempt.preamble
  };
}
