import { NATIVE_COMMANDS } from './nativeCommands.js';

export interface NativeAideStorageInfo {
  bytes: number;
  complete: boolean;
  issueCount: number;
  path: string;
}

export type NativeAideStorageCommandMap = {
  [NATIVE_COMMANDS.assistantGetStorageInfo]: {
    args: undefined;
    result: NativeAideStorageInfo;
  };
  [NATIVE_COMMANDS.assistantOpenStorageLocation]: {
    args: undefined;
    result: null;
  };
};
