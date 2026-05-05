import { NATIVE_COMMANDS, isTypedNativeCommand } from './nativeCommands.js';
import type {
  NativeApplyReviewGradeArgs,
  NativeNodeSnapshotArgs,
  NativeReadingProgressSnapshot,
  NativeReviewSchedulerSettings,
  NativeSaveReadingProgressArgs,
  NativeWorkspaceSnapshot
} from './nativeStorageContract.js';
export type {
  NativeApplyReviewGradeArgs,
  NativeNodeSnapshotArgs,
  NativeReadingProgressSnapshot,
  NativeReviewSchedulerSettings,
  NativeSaveReadingProgressArgs,
  NativeWorkspaceSnapshot
} from './nativeStorageContract.js';

export interface NativeResolvedAppPaths {
  app_data_dir: string;
  app_config_dir: string;
  app_cache_dir: string;
  app_log_dir: string;
}

export interface NativeSystemFontCatalog {
  fonts: unknown[];
  monospace_fonts: unknown[];
}

export interface NativeSchedulerCard {
  due: string;
  last_review: string | null;
  state: 0 | 1 | 2 | 3;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  reps: number;
  lapses: number;
}

export interface NativeReviewGradeArgs {
  request: {
    card: NativeSchedulerCard;
    rating: 'Again' | 'Hard' | 'Good' | 'Easy';
    now: string;
  };
}

export interface NativeReviewPreviewArgs {
  request: {
    card: NativeSchedulerCard;
    now: string;
  };
}

export interface NativeReviewGradeResult {
  card: NativeSchedulerCard;
  reviewed_at: string;
}

export interface NativeReviewPreviewResult {
  Again: NativeReviewGradeResult;
  Hard: NativeReviewGradeResult;
  Good: NativeReviewGradeResult;
  Easy: NativeReviewGradeResult;
}

export interface NativeSqliteBackupResult {
  sourcePath: string;
  destinationPath: string;
  totalPages: number;
  remainingPages: number;
}

export interface NativeSqliteRestoreResult {
  sourcePath: string;
  targetPath: string;
  totalPages: number;
  remainingPages: number;
}

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

export function invokeReviewGrade(
  invoke: NativeInvoke,
  args: NativeReviewGradeArgs
): Promise<NativeReviewGradeResult> {
  return invoke(NATIVE_COMMANDS.reviewGrade, args);
}

export function invokeReviewPreview(
  invoke: NativeInvoke,
  args: NativeReviewPreviewArgs
): Promise<NativeReviewPreviewResult> {
  return invoke(NATIVE_COMMANDS.reviewPreview, args);
}

export function invokeBootReport(
  invoke: NativeInvoke,
  args: NativeCommandArgs<typeof NATIVE_COMMANDS.bootReport>
): Promise<NativeCommandResult<typeof NATIVE_COMMANDS.bootReport>> {
  return invoke(NATIVE_COMMANDS.bootReport, args);
}

export function isTypedNativeRequest<T extends NativeCommandName>(
  request: { command: string; args?: unknown },
  command: T
): request is NativeInvokeRequest<T> {
  return isTypedNativeCommand(request.command) && request.command === command;
}
