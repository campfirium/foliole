import { NATIVE_COMMANDS } from './nativeCommands.js';
import type {
  NativeMoveNodesArgs,
  NativeMoveNodesResult
} from './nativeNodeMutationContract.js';

export type NativeMoveCommandMap = {
  [NATIVE_COMMANDS.moveNodes]: {
    args: NativeMoveNodesArgs;
    result: NativeMoveNodesResult;
  };
};
