import type { AnnotationHistoryFact } from '../core/nodes/annotationHistoryFacts.js';
import type { DeletedChildParentOrder } from '../core/nodes/restoreDeletedChildOrder.js';

import { NATIVE_COMMANDS } from './nativeCommands.js';
import type {
  NativeDeleteNodesPermanentlyResult,
  NativeRestoreNodesResult,
  NativeSoftDeleteNodesResult
} from './nativeNodeMutationContract.js';
import type { NativeWorkspaceImageRegionGroup } from './nativeWorkspaceNodeContract.js';

export interface NativeTrashParentUpdate {
  nodeId: string;
  imageRegions: NativeWorkspaceImageRegionGroup[] | null;
  updatedAt: string;
}

export type NativeAnnotationTrashGuard = {
  expectedDeletedAt: string | null;
  parents: Array<{ nodeId: string; imageRegionsHash: string }>;
} & ({ mode: 'capture' } | { mode: 'replay'; nodes: AnnotationHistoryFact[] });

export interface NativeAnnotationTrashReceipt {
  nodes: AnnotationHistoryFact[];
  deletedAt: string | null;
}

export interface NativeRestoreNodesArgs {
  annotationHistory?: NativeAnnotationTrashGuard;
  nodeIds: string[];
  parentUpdates?: NativeTrashParentUpdate[];
  parentOrders?: DeletedChildParentOrder[];
}

export interface NativeSoftDeleteNodesArgs extends NativeRestoreNodesArgs {
  deletedAt: string;
}

export type NativeTrashCommandMap = {
  [NATIVE_COMMANDS.softDeleteNodes]: {
    args: NativeSoftDeleteNodesArgs;
    result: NativeSoftDeleteNodesResult;
  };
  [NATIVE_COMMANDS.restoreNodes]: {
    args: NativeRestoreNodesArgs;
    result: NativeRestoreNodesResult;
  };
  [NATIVE_COMMANDS.deleteNodesPermanently]: {
    args: { nodeIds: string[] };
    result: NativeDeleteNodesPermanentlyResult;
  };
};
