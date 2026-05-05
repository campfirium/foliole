// @vitest-environment node

import { expect, it, vi } from 'vitest';

import { bootstrapApp } from './startupBootstrap';

function flushBootstrapWork() {
  return Promise.resolve().then(() => Promise.resolve());
}

function createEventRecorder() {
  const events: string[] = [];
  return {
    events,
    mountApp: () => {
      events.push('mount');
    },
    renderStartupError: () => {
      events.push('render-error');
    },
    reportBootStage: (stage: string) => {
      events.push(stage);
    }
  };
}

function createPendingTaskHarness() {
  const recorder = createEventRecorder();
  const pending = {
    releaseBridge: null as (() => void) | null,
    releaseSettings: null as (() => void) | null
  };

  bootstrapApp({
    mountApp: recorder.mountApp,
    renderStartupError: recorder.renderStartupError,
    reportBootStage: recorder.reportBootStage,
    reportBridgeReady: () =>
      new Promise<void>((resolve) => {
        pending.releaseBridge = resolve;
      }),
    syncAppSettings: () =>
      new Promise<void>((resolve) => {
        pending.releaseSettings = resolve;
      })
  });

  return { pending, recorder };
}

it('waits for settings sync before mounting and keeps bridge reporting non-blocking after mount', async () => {
  const harness = createPendingTaskHarness();

  expect(harness.recorder.events).toEqual([
    'boot_start',
    'settings_sync_failed_started'
  ]);

  await flushBootstrapWork();

  expect(harness.recorder.events).toEqual(['boot_start', 'settings_sync_failed_started']);

  const releaseSettingsFn = harness.pending.releaseSettings;
  if (typeof releaseSettingsFn === 'function') {
    releaseSettingsFn();
  }
  await flushBootstrapWork();

  expect(harness.recorder.events).toEqual([
    'boot_start',
    'settings_sync_failed_started',
    'settings_sync_failed_completed',
    'mount_start',
    'mount',
    'mount_complete',
    'bridge_ready_report_failed_started'
  ]);

  const releaseBridgeFn = harness.pending.releaseBridge;
  if (typeof releaseBridgeFn === 'function') {
    releaseBridgeFn();
  }
  await flushBootstrapWork();

  expect(harness.recorder.events).toEqual([
    'boot_start',
    'settings_sync_failed_started',
    'settings_sync_failed_completed',
    'mount_start',
    'mount',
    'mount_complete',
    'bridge_ready_report_failed_started',
    'bridge_ready_report_failed_completed'
  ]);
});

it('still mounts when settings sync fails', async () => {
  const recorder = createEventRecorder();

  bootstrapApp({
    mountApp: recorder.mountApp,
    renderStartupError: recorder.renderStartupError,
    reportBootStage: recorder.reportBootStage,
    reportBridgeReady: vi.fn(async () => undefined),
    syncAppSettings: vi.fn(async () => {
      throw new Error('settings failed');
    })
  });

  await flushBootstrapWork();

  expect(recorder.events).toEqual([
    'boot_start',
    'settings_sync_failed_started',
    'settings_sync_failed',
    'mount_start',
    'mount',
    'mount_complete',
    'bridge_ready_report_failed_started',
    'bridge_ready_report_failed_completed'
  ]);
});

it('renders the startup error when mounting throws', async () => {
  const reportBootStage = vi.fn();
  const renderStartupError = vi.fn();

  bootstrapApp({
    mountApp: () => {
      throw new Error('mount failed');
    },
    renderStartupError,
    reportBootStage,
    reportBridgeReady: vi.fn(async () => undefined),
    syncAppSettings: vi.fn(async () => undefined)
  });

  await flushBootstrapWork();

  expect(reportBootStage).toHaveBeenNthCalledWith(1, 'boot_start');
  expect(reportBootStage).toHaveBeenNthCalledWith(2, 'settings_sync_failed_started');
  expect(reportBootStage).toHaveBeenNthCalledWith(3, 'settings_sync_failed_completed');
  expect(reportBootStage).toHaveBeenNthCalledWith(4, 'mount_start');
  expect(reportBootStage).toHaveBeenNthCalledWith(5, 'fatal_bootstrap_error', {
    message: 'mount failed'
  });
  expect(renderStartupError).toHaveBeenCalledWith('mount failed');
});
