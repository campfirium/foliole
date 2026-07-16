import { afterEach, expect, it, vi } from 'vitest';

import type { NativeInvoke } from '../../../lib/platform/nativeContract';
import type { NativeDesktopUpdateState } from '../../../lib/platform/nativeUpdateContract';

afterEach(() => {
  delete window.electronAPI;
  vi.resetModules();
});

it('uses the narrow NativeInvoke commands and consumes sanitized state events', async () => {
  let stateHandler: ((state: NativeDesktopUpdateState) => void) | undefined;
  const invoke = vi.fn(async (command: string) => command === 'desktop_update_check'
    ? { phase: 'available', version: '0.7.0' }
    : { phase: 'ready', version: '0.7.0' });
  window.electronAPI = {
    invoke: invoke as unknown as NativeInvoke,
    onDesktopUpdateState: (handler) => {
      stateHandler = handler;
      return () => undefined;
    },
    onManagedInboxUpdated: () => () => undefined,
    onNativeMenuCommand: () => () => undefined,
    onWindowResized: () => () => undefined
  };
  const runtime = await import('./desktopUpdate');
  const subscriber = vi.fn();
  runtime.subscribeDesktopUpdateState(subscriber);

  await runtime.checkDesktopUpdate('0.7.0');
  stateHandler?.({ percent: 45, phase: 'downloading', version: '0.7.0' });

  expect(invoke).toHaveBeenCalledWith('desktop_update_check', { targetVersion: '0.7.0' });
  expect(runtime.readDesktopUpdateState()).toEqual({ percent: 45, phase: 'downloading', version: '0.7.0' });
  expect(subscriber).toHaveBeenCalled();
});

it('stays not applicable without an Electron bridge', async () => {
  const runtime = await import('./desktopUpdate');

  await expect(runtime.checkDesktopUpdate('0.7.0')).resolves.toEqual({ phase: 'not-applicable' });
});
