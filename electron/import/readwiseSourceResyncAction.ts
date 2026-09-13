import type {
  NativeReadwiseSourceResyncActionState,
  NativeReadwiseSourceResyncResult
} from '../../lib/platform/nativeReadwiseContract.js';

import type { ReadwiseApiFetchDependencies } from './readwiseApiImportFetch.js';
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
  const target = loadReadwiseSourceResyncTarget(nodeId);
  if (!target) return { node_id: nodeId, status: 'not_applicable' };
  if (readReadwiseSourceResyncRuntimeStatus(target) !== 'ready' || !beginReadwiseSourceOperation(nodeId)) {
    return { node_id: nodeId, status: 'source_inactive' };
  }
  try {
    const expectedSnapshot = captureReadwiseSourceResyncSnapshot(target);
    const candidate = await prepareReadwiseSourceResync(target, dependencies);
    const importedAt = new Date().toISOString();
    commitReadwiseSourceResync({ candidate, expectedSnapshot, importedAt, target });
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
