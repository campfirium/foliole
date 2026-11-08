import { isEpubGeneratedNodeId } from '../import/epubGeneratedNodeIdentity.js';
import { sortManualFolderNodes } from '../nodes/manualFolderOrder.js';
import { hasNodeContent } from '../nodes/nodeContentFlags.js';

import { isReadingReviewItemNode } from './reviewItemKind.js';
import { findEnabledSequentialReadingSourceId, isSequentialReadingSourceNode } from './sequentialReadingSources.js';
import type { SequentialReadingStateNode, SequentialReadingStateNodes } from './sequentialReadingState.js';

export function findNextSequentialReadingTopic(args: {
  currentNodeId: string;
  nodesById: Record<string, SequentialReadingStateNode & { importSourceFingerprint?: string | null }>;
  trashedNodeIds: string[];
  nodeOrder: string[];
}) {
  const current = args.nodesById[args.currentNodeId];
  if (!current) return null;
  const sequentialSourceId = current.sequentialReadingEnabled && isSequentialReadingSourceNode(current, args.nodesById)
    ? current.id : findEnabledSequentialReadingSourceId(current.id, args.nodesById);
  if (!sequentialSourceId && !current.importSourceFingerprint &&
    !current.manualChildOrder?.some(isEpubGeneratedNodeId) && !isEpubGeneratedNodeId(current.id)) return null;

  const children = new Map<string, SequentialReadingStateNode[]>();
  for (const node of Object.values(args.nodesById)) {
    if (!node.parentNodeId) continue;
    const siblings = children.get(node.parentNodeId) ?? [];
    siblings.push(node);
    children.set(node.parentNodeId, siblings);
  }
  const source = findEpubBookRoot(current, args.nodesById, children) ??
    (sequentialSourceId ? args.nodesById[sequentialSourceId] : null);
  if (!source) return null;
  const documentOrder = new Map(source.kind === 'topic' ? args.nodeOrder.map((id, index) => [id, index]) : []);
  const visited = new Set(args.trashedNodeIds);
  const stack = [source];
  let passedCurrent = false;
  while (stack.length) {
    const node = stack.pop()!;
    if (visited.has(node.id) || node.shelvedAt || node.anchorLink) continue;
    visited.add(node.id);
    if (passedCurrent && node.kind === 'topic' && hasNodeContent(node) && isReadingReviewItemNode(node)) return node.id;
    if (node.id === current.id) passedCurrent = true;
    const siblings = children.get(node.id) ?? [];
    const order = node.manualChildOrder ?? siblings.map(child => child.id)
      .filter(id => documentOrder.has(id)).sort((left, right) => documentOrder.get(left)! - documentOrder.get(right)!);
    for (const child of sortManualFolderNodes(siblings, order).reverse()) stack.push(child);
  }
  return null;
}

function findEpubBookRoot(current: SequentialReadingStateNode, nodes: SequentialReadingStateNodes,
  children: Map<string, SequentialReadingStateNode[]>) {
  let chapter = current;
  const visited = new Set<string>();
  while (isEpubGeneratedNodeId(chapter.id) && chapter.parentNodeId && !visited.has(chapter.id)) {
    visited.add(chapter.id);
    const parent = nodes[chapter.parentNodeId];
    if (!parent) return null;
    chapter = parent;
  }
  if (chapter.kind === 'topic' && children.get(chapter.id)?.some(child => isEpubGeneratedNodeId(child.id))) return chapter;
  return null;
}
