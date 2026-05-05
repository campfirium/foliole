// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';

import { bootstrapApp } from './startupBootstrap';

describe('bootstrapApp', () => {
  it('mounts immediately and keeps background startup tasks non-blocking', async () => {
    const events: string[] = [];
    const pending = {
      releaseBridge: null as (() => void) | null,
      releaseSettings: null as (() => void) | null
    };

    bootstrapApp({
      mountApp: () => {
        events.push('mount');
      },
      renderStartupError: () => {
        events.push('render-error');
      },
      reportBootStage: (stage) => {
        events.push(stage);
      },
      reportBridgeReady: () =>
        new Promise<void>((resolve) => {
          pending.releaseBridge = resolve;
        }),
      syncAppSettings: () =>
        new Promise<void>((resolve) => {
          pending.releaseSettings = resolve;
        })
    });

    expect(events).toEqual(['boot_start', 'mount']);

    const releaseSettingsFn = pending.releaseSettings;
    const releaseBridgeFn = pending.releaseBridge;
    if (typeof releaseSettingsFn === 'function') {
      releaseSettingsFn();
    }
    if (typeof releaseBridgeFn === 'function') {
      releaseBridgeFn();
    }
    await Promise.resolve();
    await Promise.resolve();

    expect(events).toEqual(['boot_start', 'mount']);
  });

  it('renders the startup error when mounting throws', () => {
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

    expect(reportBootStage).toHaveBeenNthCalledWith(1, 'boot_start');
    expect(reportBootStage).toHaveBeenNthCalledWith(2, 'fatal_bootstrap_error', {
      message: 'mount failed'
    });
    expect(renderStartupError).toHaveBeenCalledWith('mount failed');
  });
});
