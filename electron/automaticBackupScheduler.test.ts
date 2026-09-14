// @vitest-environment node

import type { App, PowerMonitor } from 'electron';
import { expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ app: {}, powerMonitor: {} }));
vi.mock('./database/backupRestore.js', () => ({ reconcileAutomaticDatabaseBackups: vi.fn() }));
vi.mock('./desktopOperations.js', () => ({ submitDesktopOperation: vi.fn() }));

import { createAutomaticBackupScheduler } from './automaticBackupScheduler.js';

it('checks on startup, periodically, and immediately after sleep resumes', () => {
  const appEvents = new Map<string, () => void>();
  const powerEvents = new Map<string, () => void>();
  const reconcile = vi.fn();
  const intervalCallback = vi.fn();
  const intervalHandle = {} as ReturnType<typeof globalThis.setInterval>;
  const clearIntervalHandle = vi.fn();
  const scheduler = createAutomaticBackupScheduler({
    appRef: { on: ((event: string, callback: () => void) => {
      appEvents.set(event, callback);
      return {} as App;
    }) } as Pick<App, 'on'>,
    clearIntervalHandle,
    powerMonitorRef: { on: ((event: string, callback: () => void) => {
      powerEvents.set(event, callback);
      return {} as PowerMonitor;
    }) } as Pick<PowerMonitor, 'on'>,
    reconcile,
    scheduleInterval: vi.fn((callback) => {
      intervalCallback.mockImplementation(callback);
      return intervalHandle;
    }) as unknown as typeof globalThis.setInterval
  });

  scheduler.start();
  scheduler.start();
  intervalCallback();
  powerEvents.get('resume')?.();

  expect(reconcile).toHaveBeenCalledTimes(3);
  appEvents.get('will-quit')?.();
  expect(clearIntervalHandle).toHaveBeenCalledWith(intervalHandle);
});
