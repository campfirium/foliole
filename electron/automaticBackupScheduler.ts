import { app, powerMonitor, type App, type PowerMonitor } from 'electron';

import { reconcileAutomaticDatabaseBackups } from './database/backupRestore.js';
import { submitDesktopOperation } from './desktopOperations.js';

const RECONCILE_INTERVAL_MS = 60_000;

interface AutomaticBackupSchedulerArgs {
  appRef?: Pick<App, 'on'>;
  clearIntervalHandle?: typeof globalThis.clearInterval;
  powerMonitorRef?: Pick<PowerMonitor, 'on'>;
  reconcile?: () => void;
  scheduleInterval?: typeof globalThis.setInterval;
}

export function createAutomaticBackupScheduler(args: AutomaticBackupSchedulerArgs = {}) {
  const appRef = args.appRef ?? app;
  const powerMonitorRef = args.powerMonitorRef ?? powerMonitor;
  const scheduleInterval = args.scheduleInterval ?? globalThis.setInterval;
  const clearIntervalHandle = args.clearIntervalHandle ?? globalThis.clearInterval;
  const reconcile = args.reconcile ?? submitAutomaticBackupReconcile;
  let interval: ReturnType<typeof globalThis.setInterval> | null = null;

  return {
    start() {
      if (interval) return;
      reconcile();
      interval = scheduleInterval(reconcile, RECONCILE_INTERVAL_MS);
      powerMonitorRef.on('resume', reconcile);
      appRef.on('will-quit', () => {
        if (!interval) return;
        clearIntervalHandle(interval);
        interval = null;
      });
    }
  };
}

function submitAutomaticBackupReconcile() {
  const handle = submitDesktopOperation('automatic-backup', {
    failureLabel: '[backup] automatic backup reconcile failed',
    run: () => reconcileAutomaticDatabaseBackups()
  });
  void handle.promise.catch(() => undefined);
}

let automaticBackupSchedulerStarted = false;

export function startAutomaticBackupScheduler() {
  if (automaticBackupSchedulerStarted) return;
  automaticBackupSchedulerStarted = true;
  createAutomaticBackupScheduler().start();
}
