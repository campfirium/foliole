import type { DbPort } from './dbPort.js';
import { clearConfirmedSyncPushAcksWithDbPort } from './syncPackPushAcksExecutor.js';

interface SyncPackPushAckClearOptions {
  incomingAlias?: string;
  sourcePeerId?: string;
}

export function clearConfirmedSyncPackPushAcks(
  port: DbPort,
  options: SyncPackPushAckClearOptions,
  toStateSeq: number
) {
  return clearConfirmedSyncPushAcksWithDbPort(port, {
    ...(options.incomingAlias === undefined ? {} : { incomingAlias: options.incomingAlias }),
    sourcePeerId: options.sourcePeerId!,
    toStateSeq
  });
}
