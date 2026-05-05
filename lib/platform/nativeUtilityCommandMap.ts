import { NATIVE_COMMANDS } from './nativeCommands.js';
import type {
  NativeLibraryPaths,
  NativeMirrorAttachmentLinkRebuildResult,
  NativeUpdateLibraryPathSettingArgs
} from './nativeUtilityContract.js';

export type NativeUtilityCommandMap = {
  [NATIVE_COMMANDS.loadLibraryPathSettings]: {
    args: undefined;
    result: NativeLibraryPaths;
  };
  [NATIVE_COMMANDS.rebuildMirrorAttachmentLinks]: {
    args: undefined;
    result: NativeMirrorAttachmentLinkRebuildResult;
  };
  [NATIVE_COMMANDS.updateLibraryPathSetting]: {
    args: NativeUpdateLibraryPathSettingArgs;
    result: NativeLibraryPaths;
  };
};
