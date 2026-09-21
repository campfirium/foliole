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

function asBooleanOrNull(value: unknown, field: string): boolean | null {
  if (value === null || typeof value === 'boolean') {
    return value;
  }
  throw new Error(`invalid argument: ${field}`);
}

function asMoveNodePatch(value: unknown) {
  if (!value || typeof value !== 'object') {
    throw new Error('invalid argument: nodes');
  }
  const input = value as Record<string, unknown>;
  const patch: MoveNodesInput['nodes'][number] = {
    nodeId: asString(input.nodeId, 'nodeId'),
    parentNodeId: asNullableString(input.parentNodeId, 'parentNodeId'),
    updatedAt: asString(input.updatedAt, 'updatedAt')
  };
  if ('reading' in input) {
    patch.reading = input.reading as MoveNodesInput['nodes'][number]['reading'];
  }
  if ('sequentialReadingEnabled' in input) {
    patch.sequentialReadingEnabled = asBooleanOrNull(input.sequentialReadingEnabled, 'sequentialReadingEnabled');
  }
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
    ...(args.parentUpdates !== undefined ? { parentUpdates: parseParentUpdates(args.parentUpdates) } : {})
  };
}

export function parseDeleteNodesPermanentlyArgs(args: Record<string, unknown>): DeleteNodesPermanentlyInput {
  return {
    nodeIds: asStringArray(args.nodeIds, 'nodeIds'),
    nodeOrder: asStringArray(args.nodeOrder, 'nodeOrder')
  };
}

export function parseMoveNodesArgs(args: Record<string, unknown>): MoveNodesInput {
  if (!Array.isArray(args.nodes)) {
    throw new Error('invalid argument: nodes');
  }
  return {
    nodeOrder: asStringArray(args.nodeOrder, 'nodeOrder'),
    nodes: args.nodes.map(asMoveNodePatch)
  };
}
