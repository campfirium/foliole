import type {
  DeleteNodesPermanentlyInput,
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
