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

export interface NativeCommandMap {
  app_get_version: {
    args: undefined;
    result: string;
  };
  boot_report: {
    args: {
      stage: string;
      payload?: unknown;
    };
    result: null;
  };
  list_system_fonts: {
    args: undefined;
    result: NativeSystemFontCatalog;
  };
  open_external_url: {
    args: {
      url: string;
    };
    result: null;
  };
  resolve_app_paths: {
    args: undefined;
    result: NativeResolvedAppPaths;
  };
  review_grade: {
    args: NativeReviewGradeArgs;
    result: NativeReviewGradeResult;
  };
  review_preview: {
    args: NativeReviewPreviewArgs;
    result: NativeReviewPreviewResult;
  };
  sync_app_menu_state: {
    args: {
      enabledCommandIds: string[];
    };
    result: null;
  };
  window_close: {
    args: undefined;
    result: null;
  };
  window_is_maximized: {
    args: undefined;
    result: boolean;
  };
  window_minimize: {
    args: undefined;
    result: null;
  };
  window_toggle_maximize: {
    args: undefined;
    result: null;
  };
}

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
  return invoke('review_grade', args);
}

export function invokeReviewPreview(
  invoke: NativeInvoke,
  args: NativeReviewPreviewArgs
): Promise<NativeReviewPreviewResult> {
  return invoke('review_preview', args);
}

export function invokeBootReport(
  invoke: NativeInvoke,
  args: NativeCommandArgs<'boot_report'>
): Promise<NativeCommandResult<'boot_report'>> {
  return invoke('boot_report', args);
}

export function isTypedNativeCommand(command: string): command is NativeCommandName {
  return (
    command === 'app_get_version' ||
    command === 'boot_report' ||
    command === 'list_system_fonts' ||
    command === 'open_external_url' ||
    command === 'resolve_app_paths' ||
    command === 'review_grade' ||
    command === 'review_preview' ||
    command === 'sync_app_menu_state' ||
    command === 'window_close' ||
    command === 'window_is_maximized' ||
    command === 'window_minimize' ||
    command === 'window_toggle_maximize'
  );
}

export function isTypedNativeRequest<T extends NativeCommandName>(
  request: { command: string; args?: unknown },
  command: T
): request is NativeInvokeRequest<T> {
  return request.command === command;
}
