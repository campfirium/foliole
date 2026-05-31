// @vitest-environment node

import { describe, expect, it } from 'vitest';

import { describeState, isProcessAlive } from './windows-sync-watch-manager.mjs';

describe('windows sync watch manager', () => {
  it('detects missing and dead watcher state', () => {
    expect(describeState(null)).toEqual({ running: false, reason: 'missing-state' });
    expect(describeState({ pid: 123 }, () => {
      throw new Error('missing');
    })).toEqual({ pid: 123, running: false, reason: 'dead-pid' });
  });

  it('reports a live watcher state', () => {
    expect(describeState({
      logPath: 'watch.log',
      mirrorDir: '/mnt/d/C/foliole',
      pid: 123,
      startedAt: '2026-05-31T00:00:00.000Z'
    }, () => true)).toEqual({
      logPath: 'watch.log',
      mirrorDir: '/mnt/d/C/foliole',
      pid: 123,
      running: true,
      startedAt: '2026-05-31T00:00:00.000Z'
    });
  });

  it('rejects invalid pids without probing the process table', () => {
    let probed = false;
    expect(isProcessAlive(0, () => {
      probed = true;
    })).toBe(false);
    expect(probed).toBe(false);
  });
});
