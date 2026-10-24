import { flushCurrentParentOrderProjectionsWithDbPort } from './currentParentOrderStore.js';
import type { DbPort } from './dbPort.js';
import { joinWorkspaceScopes } from './framedSyncWorkspaceScope.js';
import type { RequestSyncObjectResult } from './requestSyncBatchContract.js';
import { recordRequestSyncInbound, type RequestSyncBatchScope } from './requestSyncBatchScope.js';
import type { RequestSyncFiles } from './requestSyncFiles.js';
import { applyRequestSyncNodeBatch } from './requestSyncNodeBatchApply.js';
import { applyRequestSyncObject, openRequestSyncObjectInbound, type RequestSyncObjectInput } from './requestSyncObjectApply.js';
import {
  applyReceivedRequestSyncObject,
  receivedObjectInput,
  type RequestSyncDatabaseHost
} from './requestSyncObjectEndpoint.js';
import type { RequestSyncObjectHeader } from './requestSyncObjectMessages.js';
import { pruneLearningRowsWithoutVisibleNodes } from './syncNodeVisibilityPruning.js';

export type StagedRequestSyncObject = { header: RequestSyncObjectHeader; files: RequestSyncFiles };
type BatchInput = Parameters<typeof applyReceivedRequestSyncObject>[1];

/**
 * One pulled batch commits in one transaction and prunes stale learning rows once. If any object fails,
 * the whole batch rolls back and replays object by object, so a bad object never discards the others.
 */
export async function applyReceivedRequestSyncBatch(host: RequestSyncDatabaseHost, input: BatchInput,
  staged: readonly StagedRequestSyncObject[]): Promise<RequestSyncObjectResult[]> {
  if (staged.length < 2) return replayObjects(host, input, staged);
  let applied;
  try {
    applied = await host.write(db => db.transaction(tx => applyStagedObjects(tx, host, input, staged)));
  } catch {
    input.signal?.throwIfAborted();
    return replayObjects(host, input, staged);
  }
  for (const [index, { header }] of staged.entries()) {
    await host.objectApplied?.({ ...header, workspaceScope: applied[index]!.workspaceScope });
  }
  return staged.map(({ header }) => ({ ...header, error: '' }));
}

async function applyStagedObjects(tx: DbPort, host: RequestSyncDatabaseHost, input: BatchInput,
  staged: readonly StagedRequestSyncObject[]) {
  const pruning = { requested: false };
  const objectOptions = { ...await host.objectOptions?.(tx), ...input.objectOptions };
  const inputs = staged.map(({ header, files }) => receivedObjectInput(host, input, header, files, objectOptions, pruning));
  const batch: RequestSyncBatchScope = { overwriting: await openRequestSyncObjectInbound(tx, inputs[0]!),
    parentOrder: { requested: false } };
  // Nodes first: states, relations and reviews in the same batch may refer to them.
  const nodes = inputs.filter(objectInput => objectInput.objectType === 'node');
  const applied = new Map<RequestSyncObjectInput, Awaited<ReturnType<typeof applyRequestSyncObject>>>();
  if (nodes.length) {
    const nodeResults = await applyRequestSyncNodeBatch(tx, nodes, batch);
    nodes.forEach((objectInput, index) => applied.set(objectInput, nodeResults[index]!));
  }
  for (const objectInput of inputs) {
    if (objectInput.objectType !== 'node') applied.set(objectInput, await applyRequestSyncObject(tx, { ...objectInput, batch }));
  }
  const results = inputs.map(objectInput => applied.get(objectInput)!);
  await recordRequestSyncInbound(tx, inputs[0]!.context, inputs[0]!.requestId);
  const structure = batch.parentOrder.requested && await flushCurrentParentOrderProjectionsWithDbPort(tx);
  const expanded = pruning.requested && await pruneLearningRowsWithoutVisibleNodes(tx);
  return results.map(result => ({ ...result, workspaceScope: expanded ? { kind: 'full' as const }
    : structure ? joinWorkspaceScopes(result.workspaceScope, { kind: 'nodes', nodeIds: [], structure: true })
      : result.workspaceScope }));
}

async function replayObjects(host: RequestSyncDatabaseHost, input: BatchInput,
  staged: readonly StagedRequestSyncObject[]): Promise<RequestSyncObjectResult[]> {
  const results: RequestSyncObjectResult[] = [];
  for (const { header, files } of staged) {
    try {
      await applyReceivedRequestSyncObject(host, input, header, files);
      results.push({ ...header, error: '' });
    } catch (error) {
      input.signal?.throwIfAborted();
      results.push({ ...header, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return results;
}
