import { flushCurrentParentOrderProjectionsWithDbPort } from './currentParentOrderStore.js';
import type { DbPort } from './dbPort.js';
import { joinWorkspaceScopes } from './framedSyncWorkspaceScope.js';
import { trackCommittedAttachmentArticles } from './requestSyncAttachmentPreparation.js';
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
import { isolateRequestSyncObjectWrite } from './requestSyncObjectWriteIsolation.js';
import { pruneLearningRowsWithoutVisibleNodes } from './syncNodeVisibilityPruning.js';

export type StagedRequestSyncObject = { header: RequestSyncObjectHeader; files: RequestSyncFiles };
type BatchInput = Parameters<typeof applyReceivedRequestSyncObject>[1];

/**
 * One incoming batch commits in one transaction and prunes stale learning rows once.
 * Object failures are resolved in place before committing independent results.
 */
export async function applyReceivedRequestSyncBatch(host: RequestSyncDatabaseHost, input: BatchInput,
  staged: readonly StagedRequestSyncObject[]): Promise<RequestSyncObjectResult[]> {
  if (staged.length < 2) return applySingleObject(host, input, staged);
  let changed: string[] = [];
  const applied = await host.write(async db => {
    const tracked = await db.transaction(tx => trackCommittedAttachmentArticles(tx, host,
      staged.filter(value => value.header.objectType === 'node').map(value => value.header.globalId),
      () => applyStagedObjects(tx, host, input, staged)));
    changed = tracked.changed;
    const scopes = tracked.result.filter(result => !result.error).map(result => result.workspaceScope);
    if (scopes.length) await host.refreshNodeIndex?.(db, scopes.reduce(joinWorkspaceScopes));
    return tracked.result;
  });
  host.attachmentArticlesCommitted?.(changed);
  for (const [index, { header }] of staged.entries()) {
    const result = applied[index]!;
    if (!result.error) await host.objectApplied?.({ ...header, workspaceScope: result.workspaceScope });
  }
  return staged.map(({ header }, index) => {
    const error = applied[index]!.error;
    return error ? { ...header, error, failureStage: 'apply' } : { ...header, error: '' };
  });
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
  const applied = new Map<RequestSyncObjectInput, Pick<Awaited<ReturnType<typeof applyRequestSyncObject>>, 'workspaceScope'> & { error: string }>();
  if (nodes.length) {
    const nodeResults = await applyRequestSyncNodeBatch(tx, nodes, batch);
    nodes.forEach((objectInput, index) => applied.set(objectInput, nodeResults[index]!));
  }
  for (const objectInput of inputs) {
    if (objectInput.objectType === 'node') continue;
    const parentOrder = { requested: false };
    const visibilityPruning = { requested: false };
    const result = await isolateRequestSyncObjectWrite(tx, () => applyRequestSyncObject(tx, {
      ...objectInput, batch: { ...batch, parentOrder }, visibilityPruning
    }));
    if (result.ok) {
      batch.parentOrder.requested ||= parentOrder.requested;
      pruning.requested ||= visibilityPruning.requested;
      applied.set(objectInput, { ...result.value, error: '' });
    } else {
      applied.set(objectInput, { workspaceScope: { kind: 'nodes', nodeIds: [] }, error: result.error });
    }
  }
  const results = inputs.map(objectInput => applied.get(objectInput)!);
  const firstAccepted = inputs.find(objectInput => !applied.get(objectInput)!.error);
  if (firstAccepted) await recordRequestSyncInbound(tx, firstAccepted.context, firstAccepted.requestId);
  const structure = batch.parentOrder.requested && await flushCurrentParentOrderProjectionsWithDbPort(tx);
  const expanded = pruning.requested && await pruneLearningRowsWithoutVisibleNodes(tx);
  return results.map(result => ({ ...result, workspaceScope: expanded ? { kind: 'full' as const }
    : structure ? joinWorkspaceScopes(result.workspaceScope, { kind: 'nodes', nodeIds: [], structure: true })
      : result.workspaceScope }));
}

async function applySingleObject(host: RequestSyncDatabaseHost, input: BatchInput,
  staged: readonly StagedRequestSyncObject[]): Promise<RequestSyncObjectResult[]> {
  const object = staged[0];
  if (!object) return [];
  const { header, files } = object;
  try {
    await applyReceivedRequestSyncObject(host, input, header, files);
    return [{ ...header, error: '' }];
  } catch (error) {
    input.signal?.throwIfAborted();
    return [{ ...header, error: error instanceof Error ? error.message : String(error), failureStage: 'apply' }];
  }
}
