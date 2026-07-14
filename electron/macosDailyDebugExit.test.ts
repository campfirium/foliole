// @vitest-environment node
import { expect, it, vi } from 'vitest';

import { installMacosDailyDebugExitHandler } from './macosDailyDebugExit.js';

it('installs only for the explicit macOS daily debug runtime', async () => {
  expect(installMacosDailyDebugExitHandler({
    app: { exit: vi.fn() },
    env: {},
    getWindows: () => [],
    platform: 'darwin'
  })).toBeNull();

  const app = { exit: vi.fn() };
  const prepareExit = vi.fn(async () => undefined);
  let onChange: () => void = () => undefined;
  const close = vi.fn();
  const controller = installMacosDailyDebugExitHandler({
    app,
    env: {
      FOLIOLE_DEV_SHELL_RESTART_REQUEST_FILE: '/state/restart.json',
      FOLIOLE_MACOS_DAILY_DEBUG: '1'
    },
    getWindows: () => [],
    logger: { error: vi.fn(), info: vi.fn() },
    platform: 'darwin',
    prepareExit,
    readRequest: () => ({ kind: 'foliole-dev-shell-restart' }),
    watch: (_path, listener) => {
      onChange = () => listener('rename', 'restart.json');
      return { close };
    }
  });

  onChange();
  onChange();
  await vi.waitFor(() => expect(app.exit).toHaveBeenCalledWith(0));
  expect(prepareExit).toHaveBeenCalledOnce();
  controller?.close();
  expect(close).toHaveBeenCalledOnce();
});
