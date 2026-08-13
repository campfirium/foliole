// @vitest-environment node

import { EventEmitter } from 'node:events';
import { setImmediate } from 'node:timers';

import { expect, it, vi } from 'vitest';

import { closeWindowsSyncGroupSession } from './windows-sync-group-session-close.mjs';

function fixture(close = vi.fn(async () => {})) {
  const child = Object.assign(new EventEmitter(), {
    exitCode: null, kill: vi.fn(() => {
      setImmediate(() => {
        child.signalCode = 'SIGTERM';
        child.emit('close');
      });
      return true;
    }), signalCode: null
  });
  return { child, session: { app: { close, process: () => child } } };
}

it('allows a normal session to close gracefully', async () => {
  const current = fixture();
  await expect(closeWindowsSyncGroupSession(current.session, { timeoutMs: 10 }))
    .resolves.toEqual({ forced: false });
  expect(current.child.kill).not.toHaveBeenCalled();
});

it('forcefully interrupts the resolved Electron child at the cursor boundary', async () => {
  const current = fixture();
  await expect(closeWindowsSyncGroupSession(current.session, { force: true, timeoutMs: 10 }))
    .resolves.toEqual({ forced: true });
  expect(current.session.app.close).not.toHaveBeenCalled();
  expect(current.child.kill).toHaveBeenCalledWith('SIGTERM');
});

it('bounds a graceful close that never settles', async () => {
  const current = fixture(vi.fn(() => new Promise(() => {})));
  await expect(closeWindowsSyncGroupSession(current.session, { timeoutMs: 1 }))
    .resolves.toEqual({ forced: true });
  expect(current.child.kill).toHaveBeenCalledWith('SIGTERM');
});
