import type {
  NativeReadwiseSourceResyncActionState,
  NativeReadwiseSourceResyncResult
} from '../../lib/platform/nativeReadwiseContract.js';
import { runWithDatabaseConnectionOwner } from '../database/connection.js';

import type { ReadwiseApiFetchDependencies } from './readwiseApiImportFetch.js';
import { placeReadwisePdfHighlightsFromAttachment } from './readwisePdfPlacement.js';
import {
  beginReadwiseSourceOperation,
  finishReadwiseSourceOperation,
  isReadwiseSourceOperationRunning
} from './readwiseSourceOperationLock.js';
import { commitReadwiseSourceResync } from './readwiseSourceResyncCommit.js';
import { prepareReadwiseSourceResync } from './readwiseSourceResyncPreparation.js';
import {
  captureReadwiseSourceResyncSnapshot,
  loadReadwiseSourceResyncTarget,
  readReadwiseSourceResyncRuntimeStatus
} from './readwiseSourceResyncTarget.js';

export function loadReadwiseSourceResyncActionState(nodeId: string): NativeReadwiseSourceResyncActionState {
  const target = loadReadwiseSourceResyncTarget(nodeId);
  if (!target) return { body_authority: null, category: null, node_id: nodeId, status: 'not_applicable' };
  if (isReadwiseSourceOperationRunning(nodeId)) return state(target, 'running');
  const status = readReadwiseSourceResyncRuntimeStatus(target);
  return state(target, status);
}

export async function resyncReadwiseSource(
  nodeId: string,
  dependencies?: ReadwiseApiFetchDependencies
): Promise<NativeReadwiseSourceResyncResult> {
  const start = await runWithDatabaseConnectionOwner(() => {
    const target = loadReadwiseSourceResyncTarget(nodeId);
    if (!target) return { status: 'not_applicable' as const };
    if (readReadwiseSourceResyncRuntimeStatus(target) !== 'ready' || !beginReadwiseSourceOperation(nodeId)) {
      return { status: 'source_inactive' as const };
    }
    return { status: 'ready' as const, target, expectedSnapshot: captureReadwiseSourceResyncSnapshot(target) };
  });
  if (start.status !== 'ready') return { node_id: nodeId, status: start.status };
  try {
    const candidate = await prepareReadwiseSourceResync(start.target, dependencies);
    const importedAt = new Date().toISOString();
    await runWithDatabaseConnectionOwner(() => commitReadwiseSourceResync({
      candidate, expectedSnapshot: start.expectedSnapshot, importedAt, target: start.target
    }));
    const originalFile = start.target.state.originalFile;
    if (candidate.document.category === 'pdf' && originalFile?.status === 'localized') {
      try {
        await placeReadwisePdfHighlightsFromAttachment({
          attachmentId: originalFile.attachmentId,
          connectionRef: start.target.connectionRef,
          documentId: start.target.documentId,
          nodeId
        });
      } catch (error) {
        console.error('[readwise-source-resync] PDF highlight placement failed', { error, nodeId });
      }
    }
    return { node_id: nodeId, status: 'completed' };
  } catch (error) {
    const errorCode = readErrorCode(error);
    console.error('[readwise-source-resync] failed', { errorCode, nodeId });
    return { error_code: errorCode, node_id: nodeId, status: 'failed' };
  } finally {
    finishReadwiseSourceOperation(nodeId);
  }
}

function state(
  target: NonNullable<ReturnType<typeof loadReadwiseSourceResyncTarget>>,
  status: Exclude<NativeReadwiseSourceResyncActionState['status'], 'not_applicable'>
): NativeReadwiseSourceResyncActionState {
  return {
    body_authority: target.state.bodyAuthority,
    category: typeof target.state.metadata.category === 'string'
      ? target.state.metadata.category : null,
    node_id: target.nodeId,
    status
  };
}

function readErrorCode(error: unknown) {
  const message = error instanceof Error ? error.message : '';
  return /^[a-z0-9_:.-]+$/u.test(message) ? message.slice(0, 120) : 'readwise_resync_failed';
}
