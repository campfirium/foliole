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

export interface NativeRestoreNodesArgs {
  nodeIds: string[];
  parentUpdates?: NativeTrashParentUpdate[];
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
    args: { nodeIds: string[]; nodeOrder: string[] };
    result: NativeDeleteNodesPermanentlyResult;
  };
};
