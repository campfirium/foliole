import type { WorkspaceNodeSnapshot } from '../../../../lib/core/database/workspaceSnapshotHelpers';
import type { DailyFlowCommitArgs, DailyFlowOpenArgs, DailyFlowResult } from '../../../../lib/core/flow/dailyFlowContract';
import { retainDailyFlowRetry, settleDailyFlowRetry } from '../../../../lib/core/flow/dailyFlowRetry';
import { NATIVE_COMMANDS } from '../../../../lib/platform/nativeCommands';
import { getRuntimeInvoke } from '../runtimeInvoke';

import { getBrowserDailyFlowRuntime } from './dailyFlowBrowserRuntime';

export function hasTargetedDailyFlowRuntime() {
  return Boolean(getRuntimeInvoke() && !getBrowserDailyFlowRuntime());
}

export function hasDailyFlowRuntime() {
  return Boolean(getRuntimeInvoke() || getBrowserDailyFlowRuntime());
}

export async function openDailyFlowRuntime(args: DailyFlowOpenArgs, knownNodes: Record<string, unknown>) {
  const browser = getBrowserDailyFlowRuntime();
  if (browser) return browser.open(args, knownNodes);
  const invoke = getRuntimeInvoke();
  if (!invoke) throw new Error('Daily Flow storage is unavailable.');
  return invoke(NATIVE_COMMANDS.openDailyFlow, args).then(async result => ({ ...result,
    nodes: await loadDailyFlowDisplayNodes(result, knownNodes, result.session.daily!.scope) }));
}

export function commitDailyFlowRuntime(args: DailyFlowCommitArgs, knownNodes: Record<string, unknown>) {
  const browser = getBrowserDailyFlowRuntime();
  if (browser) return browser.commit(args, knownNodes).then(result => ({ ...result, appliedReadings: args.readings }));
  const invoke = getRuntimeInvoke();
  if (!invoke) throw new Error('Daily Flow storage is unavailable.');
  const retained = retainDailyFlowRetry(args);
  return invoke(NATIVE_COMMANDS.commitDailyFlow, retained).then(async result => {
    const display = await loadDailyFlowDisplayNodes(result, knownNodes, args.token.scope);
    settleDailyFlowRetry(args.opId);
    return { ...result, appliedReadings: retained.readings, nodes: display };
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
  return projection.nodesById as Record<string, WorkspaceNodeSnapshot>;
}

export async function loadDailyFlowViewRuntime(args: import('../../../../lib/core/flow/dailyFlowViewContract').DailyFlowViewArgs,
  seed: import('../../../../lib/core/flow/dailyFlowSession').DailyFlowSession,
  knownNodes: Record<string, unknown>) {
  const browser = getBrowserDailyFlowRuntime();
  if (browser) return browser.view(args, seed, knownNodes);
  const invoke = getRuntimeInvoke();
  if (!invoke) throw new Error('Daily Flow storage is unavailable.');
  let view = await invoke(NATIVE_COMMANDS.readDailyFlowView, args);
  if (view.status === 'needs-preparation') {
    const prepared = await invoke(NATIVE_COMMANDS.openDailyFlow, { now: args.now, mode: args.mode, seed,
      prepareOnly: true, startup: !seed.sessionStartedAt });
    view = await invoke(NATIVE_COMMANDS.readDailyFlowView, { ...args, mode: prepared.mode ?? args.mode });
  }
  if (view.status !== 'ready') throw new Error('Daily Flow view is not ready.');
  const missing = (view.nodeIds ?? []).filter(id => !knownNodes[id]);
  const projection = missing.length ? await invoke(NATIVE_COMMANDS.loadWorkspaceListProjection,
    { nodeIds: [], ancestorNodeIds: missing, structure: false, libraryScope: view.scope }) : null;
  return { view, nodes: projection?.nodesById };
}

export function saveDailyFlowSourceSettingsRuntime(args: import('../../../../lib/core/flow/dailyFlowSourceSettings').DailyFlowSourceSettingsArgs, knownNodes: Record<string, unknown> = {}) {
  const browser = getBrowserDailyFlowRuntime();
  if (browser) return browser.saveSourceSettings(args, knownNodes);
  const invoke = getRuntimeInvoke();
  if (!invoke) throw new Error('Daily Flow storage is unavailable.');
  return invoke(NATIVE_COMMANDS.saveDailyFlowSourceSettings, args);
}
