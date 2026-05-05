import type { Node } from '../features/nodes/model/nodeTypes';
import { getRuntimeInvoke } from '../shared/platform/bridge';

function toNodeSnapshotPayload(node: Node, position?: number) {
  return {
    nodeId: node.id,
    parentNodeId: node.parentNodeId,
    title: node.title,
    isTitleManual: Boolean(node.isTitleManual),
    content: node.content,
    reveal: node.reveal,
    anchorLink: node.anchorLink ?? null,
    position: typeof position === 'number' ? position : null,
    createdAt: node.createdAt,
    updatedAt: node.updatedAt
  };
}

export function syncNodeContentToRuntime(node: Node, position?: number) {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    return;
  }
  void runtimeInvoke('update_node_content', toNodeSnapshotPayload(node, position)).catch(() => undefined);
}

export function syncNodeRevealToRuntime(node: Node, position?: number) {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    return;
  }
  void runtimeInvoke('update_node_reveal', toNodeSnapshotPayload(node, position)).catch(() => undefined);
}

export function syncNodeOrderToRuntime(nodeOrder: string[]) {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    return;
  }
  void runtimeInvoke('replace_node_order', { nodeIds: nodeOrder }).catch(() => undefined);
}
