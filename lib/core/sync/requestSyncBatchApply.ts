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
import { isRequestSyncObjectFailure } from './requestSyncObjectFailure.js';
import type { RequestSyncObjectHeader } from './requestSyncObjectMessages.js';
import { createRequestSyncObjectWriteIsolation } from './requestSyncObjectWriteIsolation.js';
import { hasLearningRowsToCheck, pruneLearningRowsWithoutVisibleNodes } from './syncNodeVisibilityPruning.js';

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
  let committed = false;
  let applied: Awaited<ReturnType<typeof applyStagedObjects>>;
  try {
    applied = await host.write(async db => {
      const tracked = await db.transaction(tx => trackCommittedAttachmentArticles(tx, host,
        staged.filter(value => value.header.objectType === 'node').map(value => value.header.globalId),
        () => applyStagedObjects(tx, host, input, staged)));
      committed = true;
      changed = tracked.changed;
      const scopes = tracked.result.filter(result => !result.error).map(result => result.workspaceScope);
      if (scopes.length) await host.refreshNodeIndex?.(db, scopes.reduce(joinWorkspaceScopes));
      return tracked.result;
    });
  } catch (error) {
    input.signal?.throwIfAborted();
    if (committed || !isRequestSyncObjectFailure(errorDetail(error))) throw error;
    return applyOneByOne(host, input, staged);
  }
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

/** The batch rolled back over one object: apply each in its own transaction so only that one stays behind. */
async function applyOneByOne(host: RequestSyncDatabaseHost, input: BatchInput,
  staged: readonly StagedRequestSyncObject[]) {
  const results = new Map<StagedRequestSyncObject, RequestSyncObjectResult>();
  const nodesFirst = [...staged].sort((a, b) => Number(b.header.objectType === 'node') - Number(a.header.objectType === 'node'));
  for (const object of nodesFirst) results.set(object, (await applySingleObject(host, input, [object]))[0]!);
  return staged.map(object => results.get(object)!);
}

async function applyStagedObjects(tx: DbPort, host: RequestSyncDatabaseHost, input: BatchInput,
  staged: readonly StagedRequestSyncObject[]) {
  const pruning = { requested: false };
  const objectOptions = { ...await host.objectOptions?.(tx), ...input.objectOptions };
  const inputs = staged.map(({ header, files }) => receivedObjectInput(host, input, header, files, objectOptions, pruning));
  const batch: RequestSyncBatchScope = { overwriting: await openRequestSyncObjectInbound(tx, inputs[0]!) };
  // Nodes first: states, relations and reviews in the same batch may refer to them.
  const nodes = inputs.filter(objectInput => objectInput.objectType === 'node');
  const applied = new Map<RequestSyncObjectInput, Pick<Awaited<ReturnType<typeof applyRequestSyncObject>>, 'workspaceScope'> & { error: string }>();
  if (nodes.length) {
    const nodeResults = await applyRequestSyncNodeBatch(tx, nodes);
    nodes.forEach((objectInput, index) => applied.set(objectInput, nodeResults[index]!));
  }
  const isolation = createRequestSyncObjectWriteIsolation();
  for (const objectInput of inputs) {
    if (objectInput.objectType === 'node') continue;
    const visibilityPruning = { requested: false };
    const result = await isolation.write(tx, () => applyRequestSyncObject(tx, {
      ...objectInput, batch, visibilityPruning
    }));
    if (result.ok) {
      pruning.requested ||= visibilityPruning.requested;
      applied.set(objectInput, { ...result.value, error: '' });
    } else {
      applied.set(objectInput, { workspaceScope: { kind: 'nodes', nodeIds: [] }, error: result.error });
    }
  }
  await isolation.finish(tx);
  const results = inputs.map(objectInput => applied.get(objectInput)!);
  const firstAccepted = inputs.find(objectInput => !applied.get(objectInput)!.error);
  if (firstAccepted) await recordRequestSyncInbound(tx, firstAccepted.context, firstAccepted.requestId);
  const expanded = pruning.requested && await hasLearningRowsToCheck(tx) &&
    await pruneLearningRowsWithoutVisibleNodes(tx);
  return results.map(result => ({ ...result, workspaceScope: expanded ? { kind: 'full' as const }
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
    return [{ ...header, error: errorDetail(error), failureStage: 'apply' }];
  }
}

function errorDetail(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
