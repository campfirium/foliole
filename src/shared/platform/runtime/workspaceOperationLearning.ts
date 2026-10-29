import { NATIVE_COMMANDS } from '../../../../lib/platform/nativeCommands';
import type { Node } from '../../../features/nodes/model/nodeTypes';
import { getRuntimeInvoke } from '../runtimeInvoke';
import { logRuntimeError } from '../runtimeLogging';

/** Read facts for this operation only; callers never publish the prepared map. */
export async function readWorkspaceOperationLearning(nodes: Record<string, Node>, nodeIds: string[], libraryScope?: string) {
  const invoke = getRuntimeInvoke();
  if (!invoke) return nodes;
  try {
    if (!libraryScope) throw new Error('workspace_learning_library_missing');
    const selected = new Set(nodeIds);
    for (const id of nodeIds) {
      let parent = nodes[id]?.parentNodeId;
      while (parent && !selected.has(parent)) {
        selected.add(parent);
        parent = nodes[parent]?.parentNodeId;
      }
    }
    const result = await invoke(NATIVE_COMMANDS.loadNodeLearning, { nodeIds: [...selected], libraryScope });
    const facts = new Map(result.map(value => [value.nodeId, value]));
    const prepared = { ...nodes };
    for (const id of selected) {
      if (!nodes[id] || !facts.has(id)) throw new Error('workspace_learning_target_changed');
      prepared[id] = { ...nodes[id], reading: facts.get(id)!.reading, review: facts.get(id)!.review };
    }
    return prepared;
  } catch (error) {
    logRuntimeError('could not read operation learning facts', { area: 'persistence', action: 'load_node_learning', error });
    return null;
  }
}
