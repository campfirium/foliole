import type { RequestSyncObjectResult } from './requestSyncBatchContract.js';
import type { RequestSyncFiles } from './requestSyncFiles.js';
import { applyRequestSyncObject } from './requestSyncObjectApply.js';
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
    applied = await host.write(db => db.transaction(async tx => {
      const pruning = { requested: false };
      const objectOptions = { ...await host.objectOptions?.(tx), ...input.objectOptions };
      const results = [];
      for (const { header, files } of staged) {
        results.push(await applyRequestSyncObject(tx, receivedObjectInput(host, input, header, files, objectOptions, pruning)));
      }
      const expanded = pruning.requested && await pruneLearningRowsWithoutVisibleNodes(tx);
      return results.map(result => expanded ? { ...result, workspaceScope: { kind: 'full' as const } } : result);
    }));
  } catch {
    input.signal?.throwIfAborted();
    return replayObjects(host, input, staged);
  }
  for (const [index, { header }] of staged.entries()) {
    await host.objectApplied?.({ ...header, workspaceScope: applied[index]!.workspaceScope });
  }
  return staged.map(({ header }) => ({ ...header, error: '' }));
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
