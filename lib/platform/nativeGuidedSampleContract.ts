import { NATIVE_COMMANDS } from './nativeCommands.js';

export type NativeGuidedSampleCommandMap = {
  /** Returns the guided sample a new library was seeded with, once; later calls return null. */
  [NATIVE_COMMANDS.consumeGuidedSampleStartup]: {
    args: undefined;
    result: { rootNodeId: string | null };
  };
};
