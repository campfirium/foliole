import { NATIVE_COMMANDS } from '../../../lib/platform/nativeCommands';

import { loadRuntimeNodeSourceDetails, type RuntimeNodeSourceDetails } from './nodeSourceRuntimeRepository';
import { restoreRuntimeRemovedSource } from './removedSourcesRuntimeRepository';
import { getRuntimeInvoke, type RuntimeInvoke } from './runtimeInvoke';

export type DevReimportSelectedTopicResult =
  | { status: 'reimported'; nodeId: string | null }
  | { status: 'unavailable'; detail: string }
  | { status: 'failed'; detail: string };

interface DevReimportSelectedTopicInput {
  loadSourceDetails: (nodeId: string) => Promise<RuntimeNodeSourceDetails | null>;
  nodeId: string;
  nodeIdsToDelete?: string[];
  nodeOrder: string[];
  restoreSource: typeof restoreRuntimeRemovedSource;
  runtimeInvoke: RuntimeInvoke | null;
}

function resolveKeepImportSource(details: RuntimeNodeSourceDetails | null) {
  const item = details?.keepImportItem;
  if (!item || item.localNodeState !== 'active') {
    return null;
  }
  return { ruleId: item.ruleId, sourcePath: item.sourcePath };
}

function createNodeOrderAfterDelete(nodeOrder: string[], nodeId: string) {
  return nodeOrder.filter((candidateId) => candidateId !== nodeId);
}

export async function runDevReimportSelectedTopic(input: DevReimportSelectedTopicInput): Promise<DevReimportSelectedTopicResult> {
  if (!input.runtimeInvoke) {
    return { status: 'unavailable', detail: 'Desktop runtime is unavailable.' };
  }
  const source = resolveKeepImportSource(await input.loadSourceDetails(input.nodeId));
  if (!source) {
    return { status: 'unavailable', detail: 'Selected topic is not backed by an active keep import source.' };
  }
  const nodeIdsToDelete = input.nodeIdsToDelete?.length ? input.nodeIdsToDelete : [input.nodeId];

  try {
    await input.runtimeInvoke(NATIVE_COMMANDS.softDeleteNodes, {
      deletedAt: new Date().toISOString(),
      nodeIds: nodeIdsToDelete
    });
    await input.runtimeInvoke(NATIVE_COMMANDS.deleteNodesPermanently, {
      nodeIds: nodeIdsToDelete,
      nodeOrder: createNodeOrderAfterDelete(input.nodeOrder, input.nodeId)
    });
    const restored = await input.restoreSource(source);
    if (!restored || restored.status !== 'restored') {
      return { status: 'failed', detail: restored?.detail ?? 'Removed source could not be imported.' };
    }
    return { status: 'reimported', nodeId: restored.node_id };
  } catch (error) {
    return { status: 'failed', detail: error instanceof Error ? error.message : 'Re-import failed.' };
  }
}

export async function devReimportSelectedTopic(args: { nodeId: string; nodeIdsToDelete?: string[]; nodeOrder: string[] }) {
  return runDevReimportSelectedTopic({
    loadSourceDetails: loadRuntimeNodeSourceDetails,
    nodeId: args.nodeId,
    nodeIdsToDelete: args.nodeIdsToDelete,
    nodeOrder: args.nodeOrder,
    restoreSource: restoreRuntimeRemovedSource,
    runtimeInvoke: getRuntimeInvoke()
  });
}
