import { NATIVE_COMMANDS } from '../lib/platform/nativeCommands';

import type { RuntimeInvoke } from './shared/platform/bridge';
import type { StartupErrorActions } from './shared/ui/StartupSurface';

export type StartupViewMode =
  | {
      kind: 'booting';
    }
  | {
      errorSummary: string;
      kind: 'startup-error';
      logPath: string | null;
      moduleLabel: string;
    };

export function resolveStartupView(search: string): StartupViewMode | null {
  const params = new URLSearchParams(search);
  const view = params.get('startupView');
  if (view === 'booting') {
    return { kind: 'booting' };
  }
  if (view === 'startup-error') {
    return {
      errorSummary: params.get('startupError') ?? 'Unknown startup exception',
      kind: 'startup-error',
      logPath: params.get('startupLogPath'),
      moduleLabel: params.get('startupModule') ?? 'Startup services'
    };
  }
  return null;
}

export function createStartupErrorActions(args: {
  getRuntimeInvoke: () => RuntimeInvoke | null;
  logPath: string | null;
  reportActionFailure: (command: string, error: unknown) => void;
}): StartupErrorActions {
  const invokeNativeCommand = (command: string, commandArgs?: Record<string, unknown>) => {
    const runtimeInvoke = args.getRuntimeInvoke();
    if (!runtimeInvoke) {
      return;
    }
    void runtimeInvoke(command, commandArgs).catch((error) => {
      args.reportActionFailure(command, error);
    });
  };

  return {
    exportDiagnostics: () => invokeNativeCommand(NATIVE_COMMANDS.exportDiagnosticBundle),
    exit: () => invokeNativeCommand(NATIVE_COMMANDS.windowClose),
    openLogs: args.logPath
      ? () => invokeNativeCommand(NATIVE_COMMANDS.openLocalPath, { path: args.logPath })
      : undefined,
    retry: () => invokeNativeCommand(NATIVE_COMMANDS.windowRestartApp)
  };
}
