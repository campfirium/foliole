import type { DbPort } from './dbPort.js';
import { applySyncPackAttachmentObjectsWithDbPort } from './syncPackAttachmentObjectsExecutor.js';
import { reconcileSyncPackInlineBodies } from './syncPackBodyProjection.js';
import type { SyncPackNodeSurfaceApplyOptions } from './syncPackNodeApplyExecutor.js';
import { applySyncPackVersionedNodesWithDbPort } from './syncPackNodeConvergence.js';
import { applySyncPackNodeRowsWithDbPort } from './syncPackNodeRowsApply.js';
import { applySyncPackNodeVersionsWithDbPort } from './syncPackNodeVersionApplyExecutor.js';
import { ensureSyncPackSpecialRootParents } from './syncPackSpecialRootApply.js';

export async function applyVersionedNodeStage(port: DbPort, options: SyncPackNodeSurfaceApplyOptions) {
  await ensureSyncPackSpecialRootParents(port, options.incomingAlias);
  await applySyncPackAttachmentObjectsWithDbPort(port, options);
  await applySyncPackNodeRowsWithDbPort(port, { ...options, preserveExistingNodes: true });
  await applySyncPackNodeVersionsWithDbPort(port, options);
  const result = await applySyncPackVersionedNodesWithDbPort(port, options.hostName, options.incomingAlias);
  await reconcileSyncPackInlineBodies(port, options.incomingAlias ?? 'inc', options.enqueueSearchInvalidations !== false);
  return result;
}
