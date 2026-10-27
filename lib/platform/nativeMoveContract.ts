import type { NodeReadingPayload } from '../core/database/nodeReadingPayload.js';
import type { PushQueuePriority } from '../core/review/unifiedPushQueueRules.js';

export interface NativeMoveParentOrder {
  parentNodeId: string | null;
  childIds: string[];
}

export interface NativeMoveNodePatch {
  nodeId: string;
  expectedParentNodeId: string | null;
  parentNodeId: string | null;
  updatedAt: string;
}

export interface NativeMoveNodesArgs {
  nodes: NativeMoveNodePatch[];
  parentOrders: Array<NativeMoveParentOrder & { expectedChildIds: string[] }>;
  maintainSequentialReading: boolean;
  defaultPriority: PushQueuePriority;
}

export interface NativeMoveNodesResult {
  movedNodeIds: string[];
  parentOrders: NativeMoveParentOrder[];
  nodes: Array<{ nodeId: string; parentNodeId: string | null; updatedAt: string }>;
  readings: Array<{ nodeId: string; reading: NodeReadingPayload | null }>;
}
