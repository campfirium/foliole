import type { Node } from '../features/nodes/model/nodeTypes';

export function resolveNodeContentState(node: Pick<Node, 'content' | 'hasContent'> | null | undefined) {
  if (!node) {
    return false;
  }
  if (typeof node.hasContent === 'boolean') {
    return node.hasContent;
  }
  return node.content.trim().length > 0 ? true : undefined;
}

export function resolveNodeRevealState(node: Pick<Node, 'reveal' | 'hasReveal'> | null | undefined) {
  if (!node) {
    return false;
  }
  if (typeof node.hasReveal === 'boolean') {
    return node.hasReveal;
  }
  return node.reveal !== null ? true : undefined;
}
