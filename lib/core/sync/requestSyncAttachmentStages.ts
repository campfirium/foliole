import { hasWaitingSyncData } from './attachmentWorkBudget.js';
import type { RequestSyncAuthenticatedContext } from './requestSyncWire.js';

type StageName = 'pull' | 'text' | 'push';
type Stage = { name: StageName; run: () => Promise<void>; defer: () => void };
const nextStages = new Map<string, StageName>();

/** Deferred minimum shares get the first attachment opportunity after the next data round. */
export async function runRequestSyncAttachmentStages(context: RequestSyncAuthenticatedContext,
  stages: Stage[], blocks: () => number) {
  const key = JSON.stringify([context.groupId, context.protocolVersion, context.initiatorDeviceId,
    context.initiatorLibraryEpoch, context.responderDeviceId, context.responderLibraryEpoch]);
  const next = nextStages.get(key);
  const start = Math.max(0, stages.findIndex(stage => stage.name === next));
  const ordered = [...stages.slice(start), ...stages.slice(0, start)];
  let deferred = false;
  for (const stage of ordered) {
    if (blocks() && hasWaitingSyncData()) {
      if (!deferred) nextStages.set(key, stage.name);
      deferred = true;
      stage.defer();
    } else await stage.run();
  }
  if (!deferred) nextStages.delete(key);
}
