import type { NativeSplitTopicMutationArgs } from '../../lib/platform/nativeNodeMutationContract.js';

import { asNullableString, asString, asStringArray, asTimestamp } from './commandParserPrimitives.js';
import { parseNodeSnapshotArgs } from './commandParsers.js';

function readObject(value: unknown, field: string) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`invalid argument: ${field}`);
  }
  return value as Record<string, unknown>;
}

function parseGeneratedNodes(value: unknown) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error('invalid argument: generatedNodes');
  }
  return value.map((item, index) => {
    const node = parseNodeSnapshotArgs(readObject(item, `generatedNodes[${index}]`));
    if (node.kind !== 'topic') {
      throw new Error(`invalid argument: generatedNodes[${index}].kind`);
    }
    if (node.nodeId.length === 0) {
      throw new Error(`invalid argument: generatedNodes[${index}].nodeId`);
    }
    return node;
  });
}

function assertUniqueNodeIds(nodeIds: string[], field: string) {
  if (new Set(nodeIds).size !== nodeIds.length) {
    throw new Error(`invalid argument: ${field}`);
  }
}

export function parseSplitTopicArgs(args: Record<string, unknown>): NativeSplitTopicMutationArgs {
  const generatedNodes = parseGeneratedNodes(args.generatedNodes);
  const generatedNodeIds = generatedNodes.map((node) => node.nodeId);
  const activeNodeId = asString(args.activeNodeId, 'activeNodeId');
  const sourceNodeId = asString(args.sourceNodeId, 'sourceNodeId');
  const sourceParentNodeId = asNullableString(args.sourceParentNodeId, 'sourceParentNodeId');
  const nodeOrder = asStringArray(args.nodeOrder, 'nodeOrder');
  const disposition = asString(args.disposition, 'disposition');
  assertUniqueNodeIds(generatedNodeIds, 'generatedNodes');
  assertUniqueNodeIds(nodeOrder, 'nodeOrder');
  if (!generatedNodeIds.includes(activeNodeId)) {
    throw new Error('invalid argument: activeNodeId');
  }
  if (!nodeOrder.includes(sourceNodeId) || generatedNodeIds.some((nodeId) => !nodeOrder.includes(nodeId))) {
    throw new Error('invalid argument: nodeOrder');
  }
  if (generatedNodeIds.includes(sourceNodeId)) {
    throw new Error('invalid argument: sourceNodeId');
  }
  const sourceIndex = nodeOrder.indexOf(sourceNodeId);
  if (generatedNodeIds.some((nodeId, index) => nodeOrder[sourceIndex + index + 1] !== nodeId)) {
    throw new Error('invalid argument: nodeOrder');
  }
  const expectedParentNodeId = disposition === 'keep-as-parent' ? sourceNodeId : sourceParentNodeId;
  if (generatedNodes.some((node) => node.parentNodeId !== expectedParentNodeId)) {
    throw new Error('invalid argument: generatedNodes.parentNodeId');
  }
  if (generatedNodes.some((node) => node.position !== nodeOrder.indexOf(node.nodeId))) {
    throw new Error('invalid argument: generatedNodes.position');
  }
  const base = {
    activeNodeId,
    generatedNodes,
    nodeOrder,
    sourceNodeId,
    sourceParentNodeId
  };
  if (disposition === 'replace') return { ...base, deletedAt: asTimestamp(args.deletedAt, 'deletedAt'), disposition };
  if (disposition === 'keep-as-parent' && args.deletedAt === undefined) return { ...base, disposition };
  throw new Error('invalid argument: disposition');
}
