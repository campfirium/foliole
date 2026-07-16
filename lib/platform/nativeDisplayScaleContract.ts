import { NATIVE_COMMANDS } from './nativeCommands.js';

export interface NativeDisplayScaleCommandMap {
  [NATIVE_COMMANDS.setAppDisplayScale]: {
    args: { percent: number };
    result: null;
  };
}
