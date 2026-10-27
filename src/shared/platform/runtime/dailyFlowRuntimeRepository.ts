import type { WorkspaceNodeSnapshot } from '../../../../lib/core/database/workspaceSnapshotHelpers';
import type { DailyFlowCommitArgs, DailyFlowOpenArgs, DailyFlowResult } from '../../../../lib/core/flow/dailyFlowContract';
import { retainDailyFlowRetry, settleDailyFlowRetry } from '../../../../lib/core/flow/dailyFlowRetry';
import { NATIVE_COMMANDS } from '../../../../lib/platform/nativeCommands';
import { getRuntimeInvoke } from '../runtimeInvoke';

import { registerWorkspaceAttachmentResources } from './workspaceAttachmentResourceRegistry';

export function hasDailyFlowRuntime() {
  return Boolean(getRuntimeInvoke());
}

export function openDailyFlowRuntime(args: DailyFlowOpenArgs) {
  const invoke = getRuntimeInvoke();
  if (!invoke) throw new Error('Daily Flow storage is unavailable.');
  return invoke(NATIVE_COMMANDS.openDailyFlow, args);
}

export function commitDailyFlowRuntime(args: DailyFlowCommitArgs, knownNodes: Record<string, unknown>) {
  const invoke = getRuntimeInvoke();
  if (!invoke) throw new Error('Daily Flow storage is unavailable.');
  return invoke(NATIVE_COMMANDS.commitDailyFlow, retainDailyFlowRetry(args)).then(async result => {
    const display = await loadDailyFlowDisplayNodes(result, knownNodes, args.token.scope);
    settleDailyFlowRetry(args.opId);
    return { ...result, nodes: display };
  });
}

// Display hydration is a separate read and is only needed when the renderer lacks its target.
export async function loadDailyFlowDisplayNodes(result: DailyFlowResult, knownNodes: Record<string, unknown>, scope: string) {
  const missing = [result.session.currentNodeId, result.session.continueNodeId]
    .filter((id): id is string => Boolean(id && !knownNodes[id]));
  if (!missing.length) return undefined;
  const invoke = getRuntimeInvoke();
  if (!invoke) throw new Error('Daily Flow display storage is unavailable.');
  const projection = await invoke(NATIVE_COMMANDS.loadWorkspaceListProjection, { nodeIds: [], ancestorNodeIds: missing,
    structure: false, libraryScope: scope });
  registerWorkspaceAttachmentResources(projection);
  return projection.nodesById as Record<string, WorkspaceNodeSnapshot>;
}
