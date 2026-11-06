import { useMemo, useRef } from 'react';

import { hasNodeContent, hasNodeReveal } from '../../../lib/core/nodes/nodeContentFlags';
import type { Node } from '../../features/nodes/model/nodeTypes';

// Match the production learning snapshot: text and display titles are not queue facts.
function sameLearningNode(left: Node, right: Node) {
  return left === right || (left.id === right.id && left.kind === right.kind &&
    left.parentNodeId === right.parentNodeId && left.createdAt === right.createdAt &&
    left.deletedAt === right.deletedAt && left.shelvedAt === right.shelvedAt &&
    left.priority === right.priority && left.anchorLink?.kind === right.anchorLink?.kind &&
    hasNodeContent(left) === hasNodeContent(right) && hasNodeReveal(left) === hasNodeReveal(right) &&
    JSON.stringify([left.reading, left.review, left.learningSummary]) ===
      JSON.stringify([right.reading, right.review, right.learningSummary]));
}

export function useDailyFlowNodeInput(nodes: Record<string, Node>) {
  const previous = useRef({ nodes, key: {} });
  return useMemo(() => {
    const before = previous.current;
    const ids = Object.keys(nodes);
    if (ids.length !== Object.keys(before.nodes).length || ids.some(id => !before.nodes[id] || !sameLearningNode(before.nodes[id], nodes[id]!))) {
      previous.current = { nodes, key: {} };
    }
    previous.current.nodes = nodes;
    return previous.current.key;
  }, [nodes]);
}
