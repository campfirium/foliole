// @vitest-environment node
/* global queueMicrotask */

import { EventEmitter } from 'node:events';

import { describe, expect, it } from 'vitest';

import {
  COMPANION_LIVE_RELOAD_PORT, companionBundledEnv, companionLiveReloadEnv, createCompanionLiveServerLaunch,
  runCompanionLiveSession
} from './companion-live-session.mjs';

function fakeServer() {
  const server = Object.assign(new EventEmitter(), {
    exitCode: null,
    signalCode: null,
    kill(signal) {
      server.signalCode = signal;
      queueMicrotask(() => server.emit('exit', null));
      return true;
    }
  });
  return server;
}

describe('companion live reload session', () => {
  it('points the shell at the dev server only while building the live shell', () => {
    expect(companionLiveReloadEnv({ A: '1' })).toEqual({ A: '1', FOLIOLE_DEV_LIVE_RELOAD: '1' });
    expect(companionBundledEnv({ A: '1', FOLIOLE_DEV_LIVE_RELOAD: '1' })).toEqual({ A: '1' });
    const launch = createCompanionLiveServerLaunch({ env: { FOLIOLE_DEV_LIVE_RELOAD: '1' }, root: '/repo' });
    expect(launch.options.env).toMatchObject({ FOLIOLE_VITE_HMR: '1', FOLIOLE_VITE_PORT: String(COMPANION_LIVE_RELOAD_PORT) });
    expect(launch.options.env).not.toHaveProperty('FOLIOLE_DEV_LIVE_RELOAD');
    expect(launch.args).toContain('vite.companion.config.ts');
  });

  it('opens the shell once the server answers and restores the project after Ctrl-C', async () => {
    const server = fakeServer();
    const signals = new EventEmitter();
    const events = [];
    const done = runCompanionLiveSession({
      root: '/repo', signals, spawnProcess: () => server,
      waitForServer: async () => { events.push('ready'); },
      start: () => { events.push('start'); queueMicrotask(() => signals.emit('SIGINT')); },
      restore: () => { events.push('restore'); }
    });

    await done;
    expect(events).toEqual(['ready', 'start', 'restore']);
    expect(server.signalCode).toBe('SIGTERM');
    expect(signals.listenerCount('SIGINT')).toBe(0);
  });

  it('stops the server and still restores the project when opening the shell fails', async () => {
    const server = fakeServer();
    const events = [];
    await expect(runCompanionLiveSession({
      root: '/repo', signals: new EventEmitter(), spawnProcess: () => server, waitForServer: async () => {},
      start: () => { throw new Error('install failed'); },
      restore: () => { events.push('restore'); }
    })).rejects.toThrow('install failed');

    expect(server.signalCode).toBe('SIGTERM');
    expect(events).toEqual(['restore']);
  });
});
