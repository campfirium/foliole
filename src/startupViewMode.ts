import { definedProps } from './shared/lib/definedProps';
import { openLocalPath } from './shared/platform/bridge';
import { exportDiagnosticBundle } from './shared/platform/diagnosticBundle';
import { closeMainWindow, restartMainWindowApp } from './shared/platform/windowControls';
import type { StartupErrorActions } from './shared/ui/StartupSurface';

export type StartupViewMode =
  {
      errorSummary: string;
      kind: 'startup-error';
      logPath: string | null;
      moduleLabel: string;
    };

export function resolveStartupView(search: string): StartupViewMode | null {
  const params = new URLSearchParams(search);
  const view = params.get('startupView');
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
  logPath: string | null;
  reportActionFailure: (action: string, error: unknown) => void;
}): StartupErrorActions {
  const runStartupAction = (action: string, runner: () => Promise<unknown>) => {
    void runner().catch((error) => {
      args.reportActionFailure(action, error);
    });
  };

  return {
    exportDiagnostics: () => runStartupAction('export_diagnostics', exportDiagnosticBundle),
    exit: () => runStartupAction('exit', closeMainWindow),
    retry: () => runStartupAction('retry', restartMainWindowApp),
    ...definedProps({
      openLogs: args.logPath
        ? () => runStartupAction('open_logs', () => openLocalPath(args.logPath ?? ''))
        : undefined
    })
  };
}
