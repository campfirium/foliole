import { NATIVE_COMMANDS } from './nativeCommands.js';
import type {
  NativeBackupSettings,
  NativeClearLinkPanelBrowsingDataResult,
  NativeCopyAttachmentImageResult,
  NativeExportAttachmentImageResult,
  NativeExportCurrentArticleMirrorResult,
  NativeLibraryPaths,
  NativeMirrorAttachmentLinkRebuildResult,
  NativeMirrorOutputRebuildResult,
  NativePerformanceMemorySnapshot,
  NativeReadingPositionTraceLogAppendArgs,
  NativeSqliteBackupEntry,
  NativeSqliteBackupResult,
  NativeSqliteRestoreResult,
  NativeUpdateLibraryPathSettingArgs
} from './nativeUtilityContract.js';

export type NativeUtilityCommandMap = {
  [NATIVE_COMMANDS.appendReadingPositionTraceLog]: {
    args: NativeReadingPositionTraceLogAppendArgs;
    result: string;
  };
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
  [NATIVE_COMMANDS.exportCurrentArticleMirror]: {
    args: {
      node_id: string;
    };
    result: NativeExportCurrentArticleMirrorResult;
  };
  [NATIVE_COMMANDS.clearLinkPanelBrowsingData]: {
    args: undefined;
    result: NativeClearLinkPanelBrowsingDataResult;
  };
  [NATIVE_COMMANDS.loadLibraryPathSettings]: {
    args: undefined;
    result: NativeLibraryPaths;
  };
  [NATIVE_COMMANDS.loadBackupSettings]: {
    args: undefined;
    result: NativeBackupSettings;
  };
  [NATIVE_COMMANDS.loadPerformanceMemorySnapshot]: {
    args: undefined;
    result: NativePerformanceMemorySnapshot;
  };
  [NATIVE_COMMANDS.listSqliteBackups]: {
    args: undefined;
    result: NativeSqliteBackupEntry[];
  };
  [NATIVE_COMMANDS.backupSqliteDatabase]: {
    args: { destinationPath?: string };
    result: NativeSqliteBackupResult;
  };
  [NATIVE_COMMANDS.restoreSqliteDatabase]: {
    args: { sourcePath: string };
    result: NativeSqliteRestoreResult;
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
  [NATIVE_COMMANDS.saveBackupSettings]: {
    args: { settings: NativeBackupSettings };
    result: NativeBackupSettings;
  };
};
