import { NATIVE_COMMANDS } from './nativeCommands.js';
import type { NativeDatabaseMaintenanceStatus } from './nativeDatabaseMaintenanceContract.js';
import type {
  NativeExportSourceDispositionResult,
  NativeImportSourceDispositionResult,
  NativeSourceDispositionRestoreResult,
  NativeSourceDispositionSummary
} from './nativeSourceDispositionContract.js';
import type {
  NativeBackupSettings,
  NativeClearLinkPanelBrowsingDataResult,
  NativeCopyAttachmentImageResult,
  NativeCopyDiagnosticReportResult,
  NativeExportAttachmentImageResult,
  NativeExportCurrentArticleMirrorResult,
  NativeLibraryPaths,
  NativeMirrorAttachmentLinkRebuildResult,
  NativeMirrorOutputRebuildResult,
  NativePerformanceMemorySnapshot,
  NativeResolvedAppPaths,
  NativeReadingPositionTraceLogAppendArgs,
  NativeSystemFontCatalog,
  NativeSqliteBackupEntry,
  NativeSqliteBackupResult,
  NativeSqliteRestoreResult,
  NativeUpdateLibraryPathSettingArgs
} from './nativeUtilityContract.js';

export type NativeUtilityCommandMap = {
  [NATIVE_COMMANDS.appGetVersion]: {
    args: undefined;
    result: string;
  };
  [NATIVE_COMMANDS.appendReadingPositionTraceLog]: {
    args: NativeReadingPositionTraceLogAppendArgs;
    result: string;
  };
  [NATIVE_COMMANDS.listSystemFonts]: {
    args: undefined;
    result: NativeSystemFontCatalog;
  };
  [NATIVE_COMMANDS.loadDesktopHostCapabilities]: {
    args: undefined;
    result: {
      globalCaptureSupported: boolean;
      loginItemSupported: boolean;
    };
  };
  [NATIVE_COMMANDS.loadLoginItemSettings]: {
    args: undefined;
    result: {
      enabled: boolean;
      effective: boolean;
      supported: boolean;
    };
  };
  [NATIVE_COMMANDS.openExternalUrl]: {
    args: { url: string };
    result: null;
  };
  [NATIVE_COMMANDS.openLocalPath]: {
    args: { path: string };
    result: null;
  };
  [NATIVE_COMMANDS.openImportRoot]: {
    args: undefined;
    result: null;
  };
  [NATIVE_COMMANDS.resolveAppPaths]: {
    args: undefined;
    result: NativeResolvedAppPaths;
  };
  [NATIVE_COMMANDS.syncAppMenuState]: {
    args: {
      enabledCommandIds: string[];
      shortcutAccelerators?: { accelerator: string; commandId: string }[];
    };
    result: null;
  };
  [NATIVE_COMMANDS.windowClose]: {
    args: undefined;
    result: null;
  };
  [NATIVE_COMMANDS.windowIsMaximized]: {
    args: undefined;
    result: boolean;
  };
  [NATIVE_COMMANDS.windowMinimize]: {
    args: undefined;
    result: null;
  };
  [NATIVE_COMMANDS.windowRestartApp]: {
    args: undefined;
    result: null;
  };
  [NATIVE_COMMANDS.windowRestartDevApp]: {
    args: undefined;
    result: null;
  };
  [NATIVE_COMMANDS.windowToggleDevTools]: {
    args: undefined;
    result: null;
  };
  [NATIVE_COMMANDS.windowToggleMaximize]: {
    args: undefined;
    result: null;
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
  [NATIVE_COMMANDS.copyDiagnosticReport]: {
    args: undefined;
    result: NativeCopyDiagnosticReportResult;
  };
  [NATIVE_COMMANDS.loadLibraryPathSettings]: {
    args: undefined;
    result: NativeLibraryPaths;
  };
  [NATIVE_COMMANDS.loadDatabaseMaintenanceStatus]: {
    args: undefined;
    result: NativeDatabaseMaintenanceStatus;
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
  [NATIVE_COMMANDS.loadSourceDispositionSummary]: {
    args: undefined;
    result: NativeSourceDispositionSummary;
  };
  [NATIVE_COMMANDS.exportSourceDispositions]: {
    args: undefined;
    result: NativeExportSourceDispositionResult;
  };
  [NATIVE_COMMANDS.importSourceDispositions]: {
    args: undefined;
    result: NativeImportSourceDispositionResult;
  };
  [NATIVE_COMMANDS.restoreSourceDispositions]: {
    args: undefined;
    result: NativeSourceDispositionRestoreResult;
  };
  [NATIVE_COMMANDS.resetSourceDispositions]: {
    args: undefined;
    result: NativeSourceDispositionSummary;
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
