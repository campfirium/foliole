import { bytesToHex } from '@noble/hashes/utils.js';

import type { DbPort } from './dbPort.js';
import { applyFramedFactSources } from './framedSyncFactApply.js';
import type { FramedBodyLoader } from './framedSyncNodeRecordSource.js';
import type { RequestSyncBatchScope } from './requestSyncBatchScope.js';
import type { RequestSyncObjectInput } from './requestSyncObjectApply.js';
import { changedCurrentVersions, finishReceivedNodes, receivedObjectFacts } from './requestSyncObjectFacts.js';

/**
 * The nodes of one received batch go through one fact application, so its version, parent and convergence
 * checks read the batch's rows together instead of once per node. Per-node projection checks follow.
 */
export async function applyRequestSyncNodeBatch(tx: DbPort, inputs: readonly RequestSyncObjectInput[],
  batch: RequestSyncBatchScope) {
  const first = inputs[0]!;
  const collect = await changedCurrentVersions(tx, inputs);
  const bodyOwners = new Map<string, RequestSyncObjectInput>();
  const sources = inputs.map(input => {
    const facts = receivedObjectFacts(input, () => collect.set(input.globalId, true));
    return async function* (port: DbPort, kinds?: readonly number[]) {
      for await (const fact of facts(port, kinds)) {
        for (const blob of fact.blobs) bodyOwners.set(bytesToHex(blob.sha256), input);
        yield fact;
      }
    };
  });
  const loadBody: FramedBodyLoader = (db, blob) => {
    const owner = bodyOwners.get(bytesToHex(blob.sha256));
    if (!owner) throw new Error('request_sync_batch_body_owner_missing');
    return owner.loadBody(db, blob);
  };
  const result = await applyFramedFactSources(tx, sources, { loadBody,
    ...(first.objectOptions ? { objectOptions: first.objectOptions } : {}),
    currentVersions: { sourceIds: inputs.map(input => input.globalId), references: inputs.flatMap(input =>
      input.currentVersionId ? [{ globalId: input.globalId, versionId: input.currentVersionId }] : []) },
    ...(first.visibilityPruning ? { visibilityPruning: first.visibilityPruning } : {}),
    parentOrderFlush: batch.parentOrder,
    requireCompleteVersionGraph: true, enqueueSearchInvalidations: first.enqueueSearchInvalidations ?? true });
  first.signal?.throwIfAborted();
  await finishReceivedNodes(tx, inputs, collect);
  const workspaceScope = result.workspaceScope.kind === 'nodes'
    ? { ...result.workspaceScope, nodeIds: [...new Set([...result.workspaceScope.nodeIds, ...inputs.map(input => input.globalId)])] }
    : result.workspaceScope;
  return inputs.map(() => ({ ...result, sharedStateHash: undefined, workspaceScope }));
}
