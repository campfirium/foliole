import { expect, it, vi } from 'vitest';

import { executePreload } from './preload.testSupport.js';

it('preserves only the explicit caller refresh instruction through the sandbox bridge', () => {
  const { exposeInMainWorld, ipcOn, sandboxRequire } = executePreload();
  const handler = vi.fn();
  const bridge = exposeInMainWorld.mock.calls[0]?.[1];
  bridge.onWorkspaceContentChanged(handler);
  const listener = ipcOn.mock.calls[0]?.[1];
  listener({}, { scope: 'workspace', refreshWorkspace: false, ignored: 'private' });
  listener({}, { scope: 'workspace', refreshWorkspace: 'false' });
  listener({}, { scope: 'workspace', refreshWorkspace: true });
  expect(handler).toHaveBeenNthCalledWith(1, { scope: 'workspace', refreshWorkspace: false });
  expect(handler).toHaveBeenNthCalledWith(2, { scope: 'workspace' });
  expect(handler).toHaveBeenNthCalledWith(3, { scope: 'workspace' });
  expect(sandboxRequire.mock.calls.every(([name]) => name === 'electron')).toBe(true);
});
