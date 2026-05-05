import { NATIVE_COMMANDS } from './nativeCommands.js';
import type {
  NativeCopyAttachmentImageResult,
  NativeExportAttachmentImageResult,
  NativeLibraryPaths,
  NativeMirrorAttachmentLinkRebuildResult,
  NativeMirrorOutputRebuildResult,
  NativeUpdateLibraryPathSettingArgs
} from './nativeUtilityContract.js';

export type NativeUtilityCommandMap = {
  [NATIVE_COMMANDS.copyAttachmentImageToClipboard]: {
    args: {
      attachment_id: string;
    };
    result: NativeCopyAttachmentImageResult;
  };
  [NATIVE_COMMANDS.exportAttachmentImage]: {
    args: {
      attachment_id: string;
    };
    result: NativeExportAttachmentImageResult;
  };
  [NATIVE_COMMANDS.loadLibraryPathSettings]: {
    args: undefined;
    result: NativeLibraryPaths;
  };
  [NATIVE_COMMANDS.rebuildMirrorOutput]: {
    args: undefined;
    result: NativeMirrorOutputRebuildResult;
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
