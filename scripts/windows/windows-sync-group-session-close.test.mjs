// @vitest-environment node

import { EventEmitter } from 'node:events';
import { setImmediate } from 'node:timers';

import { expect, it, vi } from 'vitest';

import {
  closeWindowsSyncGroupSession, terminateWindowsProcessTree
} from './windows-sync-group-session-close.mjs';

function fixture(close = vi.fn(async () => {})) {
  const child = Object.assign(new EventEmitter(), {
    exitCode: null, pid: 4321, signalCode: null
  });
  const terminateTree = vi.fn(async () => {
    setImmediate(() => {
      child.signalCode = 'SIGTERM';
      child.emit('close');
    });
  });
  return { child, session: { app: { close, process: () => child } }, terminateTree };
}

it('allows a normal session to close gracefully', async () => {
  const current = fixture();
  await expect(closeWindowsSyncGroupSession(current.session, { timeoutMs: 10 }))
    .resolves.toEqual({ forced: false });
  expect(current.terminateTree).not.toHaveBeenCalled();
});

it('forcefully interrupts the resolved Electron child at the cursor boundary', async () => {
  const current = fixture();
  await expect(closeWindowsSyncGroupSession(current.session, {
    force: true, terminateTree: current.terminateTree, timeoutMs: 10
  }))
    .resolves.toEqual({ forced: true });
  expect(current.session.app.close).not.toHaveBeenCalled();
  expect(current.terminateTree).toHaveBeenCalledWith(current.child, 10);
});

it('bounds a graceful close that never settles', async () => {
  const current = fixture(vi.fn(() => new Promise(() => {})));
  await expect(closeWindowsSyncGroupSession(current.session, {
    terminateTree: current.terminateTree, timeoutMs: 1
  }))
    .resolves.toEqual({ forced: true });
  expect(current.terminateTree).toHaveBeenCalledWith(current.child, 1);
});

it('terminates only the resolved Electron PID tree', async () => {
  const execute = vi.fn((_command, _args, _options, callback) => callback(null));
  await terminateWindowsProcessTree({ exitCode: null, pid: 4321, signalCode: null }, 500, execute);
  expect(execute).toHaveBeenCalledWith('taskkill.exe', ['/PID', '4321', '/T', '/F'], {
    timeout: 500, windowsHide: true
  }, expect.any(Function));
});
