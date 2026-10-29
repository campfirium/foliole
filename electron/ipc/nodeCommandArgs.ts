import { PUSH_QUEUE_PRIORITIES } from '../../lib/core/review/unifiedPushQueueRules.js';
import type { NativeRestoreNodesArgs, NativeSoftDeleteNodesArgs, NativeTrashParentUpdate } from '../../lib/platform/nativeTrashCommandMap.js';
import type {
  DeleteNodesPermanentlyInput,
  MoveNodesInput,
} from '../database/nodeMutations.js';

import { asImageRegions } from './commandParserImageRegions.js';
import { asTimestamp } from './commandParserPrimitives.js';

function parseParentUpdates(value: unknown): NativeTrashParentUpdate[] {
  if (!Array.isArray(value)) throw new Error('invalid argument: parentUpdates');
  return value.map((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry) || !('imageRegions' in entry)) {
      throw new Error('invalid argument: parentUpdates');
    }
    return {
      nodeId: asString(entry.nodeId, 'parentUpdates.nodeId'),
      imageRegions: asImageRegions(entry.imageRegions, 'parentUpdates.imageRegions'),
      updatedAt: asTimestamp(entry.updatedAt, 'parentUpdates.updatedAt')
    };
  });
}

function asString(value: unknown, field: string): string {
  if (typeof value !== 'string') {
    throw new Error(`invalid argument: ${field}`);
  }
  return value;
}

function asStringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || item.length === 0)) {
    throw new Error(`invalid argument: ${field}`);
  }
  return value;
}

function asNullableString(value: unknown, field: string): string | null {
  if (value === null) {
    return null;
  }
  return asString(value, field);
}

function asMoveNodePatch(value: unknown) {
  if (!value || typeof value !== 'object') {
    throw new Error('invalid argument: nodes');
  }
  const input = value as Record<string, unknown>;
  const patch: MoveNodesInput['nodes'][number] = {
    nodeId: asString(input.nodeId, 'nodeId'),
    expectedParentNodeId: asNullableString(input.expectedParentNodeId, 'expectedParentNodeId'),
    parentNodeId: asNullableString(input.parentNodeId, 'parentNodeId'),
    updatedAt: asString(input.updatedAt, 'updatedAt')
  };
  if (!patch.nodeId || patch.parentNodeId === '' || patch.expectedParentNodeId === '') {
    throw new Error('invalid argument: move node identity');
  }
  if ('reading' in input || 'sequentialReadingEnabled' in input) throw new Error('invalid argument: move snapshot');
  return patch;
}

export function parseSoftDeleteNodesArgs(args: Record<string, unknown>): NativeSoftDeleteNodesArgs {
  return {
    nodeIds: asStringArray(args.nodeIds, 'nodeIds'),
    deletedAt: asString(args.deletedAt, 'deletedAt'),
    ...(args.parentUpdates !== undefined ? { parentUpdates: parseParentUpdates(args.parentUpdates) } : {})
  };
}

export function parseRestoreNodesArgs(args: Record<string, unknown>): NativeRestoreNodesArgs {
  return {
    nodeIds: asStringArray(args.nodeIds, 'nodeIds'),
    ...(args.parentOrders !== undefined ? { parentOrders: parseRestoreParentOrders(args.parentOrders) } : {}),
    ...(args.parentUpdates !== undefined ? { parentUpdates: parseParentUpdates(args.parentUpdates) } : {})
  };
}

function parseRestoreParentOrders(value: unknown): NonNullable<NativeRestoreNodesArgs['parentOrders']> {
  if (!Array.isArray(value)) throw new Error('invalid argument: parentOrders');
  const orders = value.map(entry => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error('invalid argument: parentOrders');
    const parentNodeId = asNullableString(entry.parentNodeId, 'parentNodeId');
    const childIds = asStringArray(entry.childIds, 'childIds');
    if (parentNodeId === '' || new Set(childIds).size !== childIds.length) throw new Error('invalid argument: parentOrders');
    const manualChildIds = entry.manualChildIds === undefined ? undefined : asStringArray(entry.manualChildIds, 'manualChildIds');
    if (manualChildIds && new Set(manualChildIds).size !== manualChildIds.length) throw new Error('invalid argument: manualChildIds');
    return { parentNodeId, childIds, ...(manualChildIds ? { manualChildIds } : {}) };
  });
  if (new Set(orders.map(order => order.parentNodeId)).size !== orders.length) throw new Error('invalid argument: parentOrders');
  return orders;
}

export function parseDeleteNodesPermanentlyArgs(args: Record<string, unknown>): DeleteNodesPermanentlyInput {
  if ('nodeOrder' in args) throw new Error('invalid argument: nodeOrder');
  return { nodeIds: asStringArray(args.nodeIds, 'nodeIds') };
}

export function parseMoveNodesArgs(args: Record<string, unknown>): MoveNodesInput {
  if (!Array.isArray(args.nodes) || !Array.isArray(args.parentOrders) ||
      typeof args.maintainSequentialReading !== 'boolean' ||
      !PUSH_QUEUE_PRIORITIES.some((priority) => priority === args.defaultPriority) || 'nodeOrder' in args) {
    throw new Error('invalid argument: nodes');
  }
  return {
    nodes: args.nodes.map(asMoveNodePatch),
    parentOrders: args.parentOrders.map((value) => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid argument: parentOrders');
      const order = value as Record<string, unknown>;
      return { parentNodeId: asNullableString(order.parentNodeId, 'parentNodeId'),
        expectedChildIds: asStringArray(order.expectedChildIds, 'expectedChildIds'),
        childIds: asStringArray(order.childIds, 'childIds') };
    }),
    maintainSequentialReading: args.maintainSequentialReading,
    defaultPriority: args.defaultPriority as MoveNodesInput['defaultPriority']
  };
}
