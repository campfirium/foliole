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

export function isTypedNativeCommand(command: string): command is NativeCommandName {
  return (
    command === 'app_get_version' ||
    command === 'boot_report' ||
    command === 'list_system_fonts' ||
    command === 'open_external_url' ||
    command === 'resolve_app_paths' ||
    command === 'sync_app_menu_state' ||
    command === 'window_close' ||
    command === 'window_is_maximized' ||
    command === 'window_minimize' ||
    command === 'window_toggle_maximize'
  );
}

export function isTypedNativeRequest<T extends NativeCommandName>(
  request: { command: string; args?: Record<string, unknown> | undefined },
  command: T
): request is NativeInvokeRequest<T> {
  return request.command === command;
}
