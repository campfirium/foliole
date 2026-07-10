import { NATIVE_COMMANDS } from '../../../lib/platform/nativeCommands';
import { showAppRuntimeNotice } from '../ui/AppRuntimeNotice';

import { isDesktopRuntime } from './runtime';
import { getRuntimeInvoke } from './runtimeInvoke';
import { logRuntimeError } from './runtimeLogging';
import {
  readPendingNodeOrder,
  readPendingReadingProgress,
  readPendingRelearnNodes,
  resolvePendingNodeOrder,
  resolvePendingReadingProgress,
  resolvePendingRelearnNode,
  stagePendingNodeOrder,
  stagePendingReadingProgress,
  stagePendingRelearnNode,
  type PendingDurableAck
} from './workspacePendingDurableMutations';
import type {
  WorkspaceReadingProgressSavePayload,
  WorkspaceRelearnNodePayload
} from './workspaceRuntimeTypes';

function logPendingRuntimeFailure(action: string, command: string, error: unknown) {
  logRuntimeError('runtime sync deferred for replay', {
    area: 'native',
    action,
    command,
    fallback: 'keep_pending',
    error
  });
}

function runAcceptedInvoke(
  request: Promise<unknown>,
  resolve: () => unknown,
  action: string,
  command: string
) {
  void request.then(resolve).catch((error) => logPendingRuntimeFailure(action, command, error));
}

function reportRecoveryStageFailure() {
  showAppRuntimeNotice('Could not save this change. Try again.');
}

export function saveWorkspaceNodeOrder(nodeOrder: string[]) {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke && !isDesktopRuntime()) return true;
  const ack = stagePendingNodeOrder(nodeOrder);
  if (!ack) {
    reportRecoveryStageFailure();
    return false;
  }
  if (runtimeInvoke) {
    runAcceptedInvoke(
      runtimeInvoke(NATIVE_COMMANDS.replaceNodeOrder, { nodeIds: nodeOrder }),
      () => resolvePendingNodeOrder(ack),
      'sync_node_order',
      NATIVE_COMMANDS.replaceNodeOrder
    );
  }
  return true;
}

export function saveWorkspaceRelearnNode(payload: WorkspaceRelearnNodePayload) {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke && !isDesktopRuntime()) return true;
  const ack = stagePendingRelearnNode(payload.nodeId);
  if (!ack) {
    reportRecoveryStageFailure();
    return false;
  }
  if (runtimeInvoke) {
    runAcceptedInvoke(
      runtimeInvoke(NATIVE_COMMANDS.relearnNode, payload),
      () => resolvePendingRelearnNode(payload.nodeId, ack),
      'sync_relearn_node',
      NATIVE_COMMANDS.relearnNode
    );
  }
  return true;
}

export function saveWorkspaceReadingProgress(payload: WorkspaceReadingProgressSavePayload) {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke && !isDesktopRuntime()) return true;
  const ack = stagePendingReadingProgress(payload);
  if (!ack) {
    reportRecoveryStageFailure();
    return false;
  }
  if (runtimeInvoke) {
    runAcceptedInvoke(
      runtimeInvoke(NATIVE_COMMANDS.saveReadingProgress, payload),
      () => resolvePendingReadingProgress(ack),
      'sync_reading_progress',
      NATIVE_COMMANDS.saveReadingProgress
    );
  }
  return true;
}

export async function saveWorkspaceReadingProgressNow(payload: WorkspaceReadingProgressSavePayload): Promise<void> {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke && !isDesktopRuntime()) return;
  const ack = stagePendingReadingProgress(payload);
  if (!ack) {
    reportRecoveryStageFailure();
    throw new Error('reading progress recovery staging failed');
  }
  if (!runtimeInvoke) return;
  try {
    await runtimeInvoke(NATIVE_COMMANDS.saveReadingProgress, payload);
    resolvePendingReadingProgress(ack);
  } catch (error) {
    logPendingRuntimeFailure('sync_reading_progress_now', NATIVE_COMMANDS.saveReadingProgress, error);
  }
}

async function replayPendingNodeOrder() {
  const entry = readPendingNodeOrder();
  if (!entry) return;
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) throw new Error('runtime bridge unavailable for pending node order');
  await runtimeInvoke(NATIVE_COMMANDS.replaceNodeOrder, { nodeIds: entry.payload });
  if (!resolvePendingNodeOrder(entry)) throw new Error('pending node order acknowledgement failed');
}

export async function drainPendingWorkspaceRelearnNode(nodeId: string) {
  const entry = readPendingRelearnNodes().find((candidate) => candidate.payload.nodeId === nodeId);
  if (!entry) return;
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) throw new Error('runtime bridge unavailable for pending relearn');
  await runtimeInvoke(NATIVE_COMMANDS.relearnNode, entry.payload);
  if (!resolvePendingRelearnNode(nodeId, entry)) throw new Error('pending relearn acknowledgement failed');
}

async function replayPendingRelearnNodes() {
  for (const entry of readPendingRelearnNodes()) {
    await drainPendingWorkspaceRelearnNode(entry.payload.nodeId);
  }
}

async function replayPendingReadingProgress() {
  const entry = readPendingReadingProgress();
  if (!entry) return;
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) throw new Error('runtime bridge unavailable for pending reading progress');
  await runtimeInvoke(NATIVE_COMMANDS.saveReadingProgress, entry.payload);
  if (!resolvePendingReadingProgress(entry)) throw new Error('pending reading progress acknowledgement failed');
}

export async function replayPendingWorkspaceDurableMutations() {
  await replayPendingNodeOrder();
  await replayPendingRelearnNodes();
  await replayPendingReadingProgress();
}

export function capturePendingNodeOrderAck(): PendingDurableAck | null {
  const entry = readPendingNodeOrder();
  return entry ? { revision: entry.revision, signature: entry.signature } : null;
}

export function resolveCapturedPendingNodeOrder(ack: PendingDurableAck | null) {
  return ack ? resolvePendingNodeOrder(ack) : false;
}
