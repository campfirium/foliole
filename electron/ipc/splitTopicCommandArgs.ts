import type { NativeSplitTopicMutationArgs } from '../../lib/platform/nativeNodeMutationContract.js';

import { asString, asStringArray, asTimestamp } from './commandParserPrimitives.js';
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
  const nodeOrder = asStringArray(args.nodeOrder, 'nodeOrder');
  const deletedAt = asTimestamp(args.deletedAt, 'deletedAt');
  assertUniqueNodeIds(generatedNodeIds, 'generatedNodes');
  if (!generatedNodeIds.includes(activeNodeId)) {
    throw new Error('invalid argument: activeNodeId');
  }
  if (!nodeOrder.includes(sourceNodeId) || generatedNodeIds.some((nodeId) => !nodeOrder.includes(nodeId))) {
    throw new Error('invalid argument: nodeOrder');
  }
  if (generatedNodeIds.includes(sourceNodeId)) {
    throw new Error('invalid argument: sourceNodeId');
  }
  return {
    activeNodeId,
    deletedAt,
    generatedNodes,
    nodeOrder,
    sourceNodeId
  };
}
