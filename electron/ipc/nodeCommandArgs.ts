import type {
  DeleteNodesPermanentlyInput,
  MoveNodesInput,
  RestoreNodesInput,
  SoftDeleteNodesInput
} from '../database/nodeMutations.js';

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

export function parseSoftDeleteNodesArgs(args: Record<string, unknown>): SoftDeleteNodesInput {
  return {
    nodeIds: asStringArray(args.nodeIds, 'nodeIds'),
    deletedAt: asString(args.deletedAt, 'deletedAt')
  };
}

export function parseRestoreNodesArgs(args: Record<string, unknown>): RestoreNodesInput {
  return {
    nodeIds: asStringArray(args.nodeIds, 'nodeIds')
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
