import { NATIVE_COMMANDS } from './nativeCommands.js';
import type {
  NativeDeleteNodesPermanentlyResult,
  NativeRestoreNodesResult,
  NativeSoftDeleteNodesResult
} from './nativeNodeMutationContract.js';

export type NativeTrashCommandMap = {
  [NATIVE_COMMANDS.softDeleteNodes]: {
    args: { nodeIds: string[]; deletedAt: string };
    result: NativeSoftDeleteNodesResult;
  };
  [NATIVE_COMMANDS.restoreNodes]: {
    args: { nodeIds: string[] };
    result: NativeRestoreNodesResult;
  };
  [NATIVE_COMMANDS.deleteNodesPermanently]: {
    args: { nodeIds: string[]; nodeOrder: string[] };
    result: NativeDeleteNodesPermanentlyResult;
  };
};
