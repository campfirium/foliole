type BootStageReporter = (stage: string, payload?: Record<string, unknown>) => void;

interface StartupBootstrapArgs {
  mountApp: () => void | Promise<void>;
  renderStartupError: (message: string) => void;
  reportBootStage: BootStageReporter;
  reportBridgeReady: () => Promise<void>;
  syncAppSettings: () => Promise<void>;
}

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Unknown startup exception';
}

async function runBackgroundTask(
  task: () => Promise<void>,
  reportBootStage: BootStageReporter,
  stage: string
) {
  reportBootStage(`${stage}_started`);
  try {
    await task();
    reportBootStage(`${stage}_completed`);
  } catch (error) {
    console.error(`[startup] ${stage}`, error);
    reportBootStage(stage, {
      message: toErrorMessage(error)
    });
  }
}

export function bootstrapApp(args: StartupBootstrapArgs) {
  void (async () => {
    args.reportBootStage('boot_start');

    try {
      args.reportBootStage('mount_start');
      await args.mountApp();
      args.reportBootStage('mount_complete');
    } catch (error) {
      console.error('[startup] fatal bootstrap error', error);
      args.reportBootStage('fatal_bootstrap_error', {
        message: toErrorMessage(error)
      });
      args.renderStartupError(toErrorMessage(error));
      return;
    }

    void runBackgroundTask(args.syncAppSettings, args.reportBootStage, 'settings_sync_failed');
    void runBackgroundTask(args.reportBridgeReady, args.reportBootStage, 'bridge_ready_report_failed');
  })();
}
