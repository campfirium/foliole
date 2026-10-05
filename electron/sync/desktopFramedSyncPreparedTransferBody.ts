import type { PreparedTransferAttempt } from '../../lib/core/sync/framedSyncContract.js';
import type { OutboundPublishInput } from '../../lib/core/sync/framedSyncStagingContract.js';
import type { FramedSyncStagingPort } from '../../lib/core/sync/framedSyncStagingPort.js';

import { processFrameStream } from './desktopFramedSyncProcessWire.js';
import { inspectFramedSyncEncodedStream } from './desktopFramedSyncStream.js';

export async function loadDesktopFramedSyncPreparedTransferBody(input: {
  attempt: PreparedTransferAttempt;
  publication: OutboundPublishInput;
  staging: FramedSyncStagingPort;
}) {
  const inspectFrames = input.staging.streamReplayableFrames(
    input.publication.transferId,
    input.attempt.attemptId
  );
  const inspected = await inspectFramedSyncEncodedStream(input.attempt.preamble, processFrameStream(inspectFrames));
  return {
    ...inspected,
    frames: processFrameStream(input.staging.streamReplayableFrames(
      input.publication.transferId,
      input.attempt.attemptId
    )),
    preamble: input.attempt.preamble
  };
}
