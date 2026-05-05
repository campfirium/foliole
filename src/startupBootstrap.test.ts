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

it('mounts immediately and keeps settings sync and bridge reporting non-blocking after mount', async () => {
  const harness = createPendingTaskHarness();

  expect(harness.recorder.events).toEqual(['boot_start', 'mount']);

  const releaseSettingsFn = harness.pending.releaseSettings;
  const releaseBridgeFn = harness.pending.releaseBridge;
  if (typeof releaseSettingsFn === 'function') {
    releaseSettingsFn();
  }
  await flushBootstrapWork();

  expect(harness.recorder.events).toEqual(['boot_start', 'mount']);

  if (typeof releaseBridgeFn === 'function') {
    releaseBridgeFn();
  }
  await flushBootstrapWork();

  expect(harness.recorder.events).toEqual(['boot_start', 'mount']);
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

  expect(recorder.events).toEqual(['boot_start', 'mount', 'settings_sync_failed']);
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
  expect(reportBootStage).toHaveBeenNthCalledWith(2, 'fatal_bootstrap_error', {
    message: 'mount failed'
  });
  expect(renderStartupError).toHaveBeenCalledWith('mount failed');
});
