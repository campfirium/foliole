import { NATIVE_COMMANDS } from '../../../../lib/platform/nativeCommands';
import type { Node } from '../../../features/nodes/model/nodeTypes';
import { getRuntimeInvoke } from '../runtimeInvoke';

export type WorkspaceNodeLearning = Pick<Node, 'reading' | 'review'>;

export async function loadWorkspaceNodeLearning(nodeId: string, libraryScope: string): Promise<WorkspaceNodeLearning | null> {
  const invoke = getRuntimeInvoke();
  if (!invoke) throw new Error('workspace_learning_runtime_missing');
  const result = await invoke(NATIVE_COMMANDS.loadNodeLearning, { nodeIds: [nodeId], libraryScope });
  const node = result.find(value => value.nodeId === nodeId);
  return node ? { reading: node.reading ?? null, review: node.review ?? null } : null;
}
