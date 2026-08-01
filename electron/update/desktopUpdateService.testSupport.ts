import { vi } from 'vitest';

import { DesktopUpdateService, type DesktopUpdaterAdapter } from './desktopUpdateService.js';

type StoredRecord = {
  checkpoint: 'discovered' | 'downloaded';
  installedVersion: string;
  schemaVersion: 1;
  targetVersion: string;
};

interface DesktopUpdateHarnessOptions {
  applicable?: boolean;
  currentVersion?: string;
  isUpdateAvailable?: boolean;
  providerVersion?: string | null;
  retryDelaysMs?: readonly number[];
  storedRecord?: StoredRecord | null;
}

function createStateStore(storedRecord: StoredRecord | null = null) {
  return {
    clear: vi.fn(async () => undefined),
    read: vi.fn(async () => storedRecord),
    write: vi.fn(async () => undefined)
  };
}

export function createDesktopUpdateServiceHarness(options: DesktopUpdateHarnessOptions = {}) {
  const listeners = new Map<string, (payload?: Record<string, unknown>) => void>();
  let resolveDownload: () => void = () => undefined;
  let rejectDownload: (error?: Error) => void = () => undefined;
  const downloadUpdate = vi.fn(() => new Promise<string[]>((resolve, reject) => {
    resolveDownload = () => resolve(['installer']);
    rejectDownload = (error = new Error('download failed')) => reject(error);
  }));
  const updater = {
    allowDowngrade: true,
    autoDownload: true,
    autoInstallOnAppQuit: true,
    checkForUpdates: vi.fn(async () => options.providerVersion === null
      ? null
      : {
          isUpdateAvailable: options.isUpdateAvailable !== false,
          updateInfo: { version: options.providerVersion ?? '0.7.0' }
        }),
    downloadUpdate,
    on: vi.fn((event: string, listener: (payload?: Record<string, unknown>) => void) => {
      listeners.set(event, listener);
    }),
    quitAndInstall: vi.fn()
  } satisfies DesktopUpdaterAdapter;
  const sender = { isDestroyed: vi.fn(() => false), send: vi.fn() };
  const prepareInstall = vi.fn(async () => true);
  const loadUpdater = vi.fn(async () => updater);
  const stateStore = createStateStore(options.storedRecord);
  const reportDiagnostic = vi.fn();
  const isApplicable = vi.fn(() => options.applicable !== false);
  const service = new DesktopUpdateService({
    eventChannel: 'foliole:desktop-update-state',
    getCurrentVersion: () => options.currentVersion ?? '0.6.0',
    isApplicable,
    loadUpdater,
    prepareInstall,
    reportDiagnostic,
    retryDelaysMs: options.retryDelaysMs ?? [],
    stateStore
  });
  return {
    listeners,
    isApplicable,
    loadUpdater,
    prepareInstall,
    rejectDownload: (error?: Error) => rejectDownload(error),
    reportDiagnostic,
    resolveDownload: () => resolveDownload(),
    sender,
    service,
    stateStore,
    updater
  };
}
