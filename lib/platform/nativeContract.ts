import { NATIVE_COMMANDS, isTypedNativeCommand } from './nativeCommands.js';
import type {
  NativeDirectoryImportArgs,
  NativeDirectoryImportResult,
  NativeImportedTextFile,
  NativeTextImportArgs,
  NativeTextImportResult
} from './nativeImportContract.js';
import type {
  NativeApplyReviewGradeArgs,
  NativeRelearnNodeArgs,
  NativeNodeSnapshotArgs,
  NativeReadingProgressSnapshot,
  NativeReviewSchedulerSettings,
  NativeSaveReadingProgressArgs,
  NativeWorkspaceSnapshot
} from './nativeStorageContract.js';
import type {
  NativeResolvedAppPaths,
  NativeReviewGradeArgs,
  NativeReviewGradeResult,
  NativeReviewPreviewArgs,
  NativeReviewPreviewResult,
  NativeSqliteBackupResult,
  NativeSqliteRestoreResult,
  NativeSystemFontCatalog
} from './nativeUtilityContract.js';
export type {
  NativeApplyReviewGradeArgs,
  NativeRelearnNodeArgs,
  NativeNodeSnapshotArgs,
  NativeReadingProgressSnapshot,
  NativeReviewSchedulerSettings,
  NativeSaveReadingProgressArgs,
  NativeWorkspaceSnapshot
} from './nativeStorageContract.js';
export type {
  NativeDirectoryImportArgs,
  NativeDirectoryImportConsumePolicy,
  NativeDirectoryImportEntry,
  NativeDirectoryImportResult,
  NativeDirectoryImportSourceAdapter,
  NativeImportedTextFile,
  NativeManagedInboxConsumePolicy,
  NativeTextImportArgs,
  NativeTextImportResult
} from './nativeImportContract.js';
export type {
  NativeResolvedAppPaths,
  NativeReviewGradeArgs,
  NativeReviewGradeResult,
  NativeReviewPreviewArgs,
  NativeReviewPreviewResult,
  NativeSchedulerCard,
  NativeSqliteBackupResult,
  NativeSqliteRestoreResult,
  NativeSystemFontCatalog
} from './nativeUtilityContract.js';

export type NativeCommandMap = {
  [NATIVE_COMMANDS.appGetVersion]: {
    args: undefined;
    result: string;
  };
  [NATIVE_COMMANDS.bootReport]: {
    args: {
      stage: string;
      payload?: unknown;
    };
    result: null;
  };
  [NATIVE_COMMANDS.listSystemFonts]: {
    args: undefined;
    result: NativeSystemFontCatalog;
  };
  [NATIVE_COMMANDS.openExternalUrl]: {
    args: {
      url: string;
    };
    result: null;
  };
  [NATIVE_COMMANDS.runTextFileImport]: {
    args: NativeTextImportArgs;
    result: NativeTextImportResult | null;
  };
  [NATIVE_COMMANDS.runDirectoryImport]: {
    args: NativeDirectoryImportArgs;
    result: NativeDirectoryImportResult | null;
  };
  [NATIVE_COMMANDS.selectImportTextFile]: {
    args: NativeTextImportArgs;
    result: NativeImportedTextFile | null;
  };
  [NATIVE_COMMANDS.selectImportDirectory]: {
    args: undefined;
    result: string | null;
  };
  [NATIVE_COMMANDS.resolveAppPaths]: {
    args: undefined;
    result: NativeResolvedAppPaths;
  };
  [NATIVE_COMMANDS.reviewGrade]: {
    args: NativeReviewGradeArgs;
    result: NativeReviewGradeResult;
  };
  [NATIVE_COMMANDS.reviewPreview]: {
    args: NativeReviewPreviewArgs;
    result: NativeReviewPreviewResult;
  };
  [NATIVE_COMMANDS.syncAppMenuState]: {
    args: {
      enabledCommandIds: string[];
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
  [NATIVE_COMMANDS.windowToggleDevTools]: {
    args: undefined;
    result: null;
  };
  [NATIVE_COMMANDS.windowToggleMaximize]: {
    args: undefined;
    result: null;
  };
  [NATIVE_COMMANDS.loadWorkspaceSnapshot]: {
    args: undefined;
    result: NativeWorkspaceSnapshot;
  };
  [NATIVE_COMMANDS.loadAppSettingsState]: {
    args: undefined;
    result: Record<string, string>;
  };
  [NATIVE_COMMANDS.saveAppSettingsState]: {
    args: { settings: Record<string, string> };
    result: null;
  };
  [NATIVE_COMMANDS.loadReviewSchedulerSettings]: {
    args: undefined;
    result: NativeReviewSchedulerSettings;
  };
  [NATIVE_COMMANDS.saveReviewSchedulerSettings]: {
    args: { settings: NativeReviewSchedulerSettings };
    result: NativeReviewSchedulerSettings;
  };
  [NATIVE_COMMANDS.loadReadingProgress]: {
    args: undefined;
    result: NativeReadingProgressSnapshot;
  };
  [NATIVE_COMMANDS.saveReadingProgress]: {
    args: NativeSaveReadingProgressArgs;
    result: null;
  };
  [NATIVE_COMMANDS.backupSqliteDatabase]: {
    args: { destinationPath?: string };
    result: NativeSqliteBackupResult;
  };
  [NATIVE_COMMANDS.restoreSqliteDatabase]: {
    args: { sourcePath: string };
    result: NativeSqliteRestoreResult;
  };
  [NATIVE_COMMANDS.updateNodeContent]: {
    args: NativeNodeSnapshotArgs;
    result: null;
  };
  [NATIVE_COMMANDS.updateNodeReveal]: {
    args: NativeNodeSnapshotArgs;
    result: null;
  };
  [NATIVE_COMMANDS.relearnNode]: {
    args: NativeRelearnNodeArgs;
    result: null;
  };
  [NATIVE_COMMANDS.replaceNodeOrder]: {
    args: { nodeIds: string[] };
    result: null;
  };
  [NATIVE_COMMANDS.softDeleteNodes]: {
    args: { nodeIds: string[]; deletedAt: string };
    result: null;
  };
  [NATIVE_COMMANDS.restoreNodes]: {
    args: { nodeIds: string[] };
    result: null;
  };
  [NATIVE_COMMANDS.deleteNodesPermanently]: {
    args: { nodeIds: string[]; nodeOrder: string[] };
    result: null;
  };
  [NATIVE_COMMANDS.applyReviewGrade]: {
    args: NativeApplyReviewGradeArgs;
    result: null;
  };
};

export type NativeCommandName = keyof NativeCommandMap;

export type NativeCommandArgs<T extends NativeCommandName> = NativeCommandMap[T]['args'];

export type NativeCommandResult<T extends NativeCommandName> = NativeCommandMap[T]['result'];

type NativeInvokeTuple<T extends NativeCommandName> = NativeCommandArgs<T> extends undefined
  ? []
  : [args: NativeCommandArgs<T>];

export type NativeInvokeRequest<T extends NativeCommandName = NativeCommandName> = T extends NativeCommandName
  ? NativeCommandArgs<T> extends undefined
    ? { command: T; args?: undefined }
    : { command: T; args: NativeCommandArgs<T> }
  : never;

export interface NativeInvoke {
  <T extends NativeCommandName>(command: T, ...args: NativeInvokeTuple<T>): Promise<NativeCommandResult<T>>;
  (command: string, args?: Record<string, unknown>): Promise<unknown>;
}

export function isTypedNativeRequest<T extends NativeCommandName>(
  request: { command: string; args?: unknown },
  command: T
): request is NativeInvokeRequest<T> {
  return isTypedNativeCommand(request.command) && request.command === command;
}
