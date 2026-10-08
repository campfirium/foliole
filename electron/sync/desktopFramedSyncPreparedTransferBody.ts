import type { DbPort } from '../../lib/core/sync/dbPort.js';
import type { PreparedTransferAttempt } from '../../lib/core/sync/framedSyncContract.js';
import type { OutboundPublishInput } from '../../lib/core/sync/framedSyncStagingContract.js';
import type { FramedSyncStagingPort } from '../../lib/core/sync/framedSyncStagingPort.js';
import { readFramedSyncPayloadBudget } from '../database/framedSyncPayloadBudgetOwner.js';

import { spoolDesktopFramedSyncBody } from './desktopFramedSyncBodySpool.js';
import { processFrameStream } from './desktopFramedSyncProcessWire.js';

export async function loadDesktopFramedSyncPreparedTransferBody(input: {
  attempt: PreparedTransferAttempt;
  db?: DbPort;
  publication: OutboundPublishInput;
  staging: FramedSyncStagingPort;
}) {
  const payloadBudget = input.db ? readFramedSyncPayloadBudget(input.db) : undefined;
  const inspectFrames = input.staging.streamReplayableFrames(
    input.publication.transferId,
    input.attempt.attemptId
  );
  return spoolDesktopFramedSyncBody({
    frames: processFrameStream(inspectFrames, payloadBudget),
    payloadBudget,
    preamble: input.attempt.preamble
  });
}
