// @vitest-environment node

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { cleanupAgentXml, installCleanupAgent, uninstallCleanupAgent } from './scheduled-disk-cleanup-launchd.mjs';
import { INTERNAL_LOW_BYTES, UD_LOW_BYTES, runTick } from './scheduled-disk-cleanup-tick.mjs';

const GIB = 1024 ** 3;
const HOUR = 60 * 60 * 1000;

function harness({ internal = 100 * GIB, ud = 200 * GIB } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'foliole-cleanup-tick-'));
  const config = { a5LeasePath: path.join(root, 'lease'), internalVolume: 'internal', repoRoot: root, udVolume: 'ud' };
  const space = { internal, ud };
  const calls = { notes: [], rounds: [] };
  const holders = { list: [] };
  const tick = (nowMs, overrides = {}) => runTick({
    config, free: (volume) => space[volume], holders: () => holders.list, mounted: () => true, nowMs,
    notifyUser: (message) => calls.notes.push(message),
    round: (_config, reasons) => {
      calls.rounds.push(reasons);
      return { free: { after: { ud: space.ud + 70 * GIB } }, overCap: [{ bytes: 6 * GIB, task: 'T742' }],
        reportPath: 'r.json', status: 'complete', steps: {} };
    },
    statePath: path.join(root, 'state.json'), ...overrides
  });
  return { calls, done: () => fs.rmSync(root, { force: true, recursive: true }), holders, root, space, tick };
}

const at = (hour, day = 22) => new Date(2026, 10, day, hour, 0).getTime();

describe('scheduled disk cleanup tick', () => {
  it('runs the daily round once, only in the noon or 19:20 window, and stays idle otherwise', () => {
    const { calls, done, holders, tick } = harness();
    try {
      expect(tick(at(5)).action).toBe('idle');
      expect(tick(at(15)).action).toBe('idle');
      expect(tick(at(12))).toMatchObject({ action: 'round', reasons: ['daily'] });
      expect(tick(at(13)).action).toBe('idle');
      expect(tick(at(20)).action).toBe('idle');
      holders.list = ['node-heavy:tests:1'];
      expect(tick(at(12, 23)).action).toBe('deferred');
      holders.list = [];
      expect(tick(at(19, 23)).action).toBe('idle');
      expect(tick(at(19, 23) + 20 * 60 * 1000)).toMatchObject({ action: 'round', reasons: ['daily'] });
      expect(tick(at(22, 23)).action).toBe('idle');
      expect(calls.rounds).toEqual([['daily'], ['daily']]);
      expect(calls.notes).toEqual(['超过 5G 的任务目录：T742 6.0G。']);
    } finally {
      done();
    }
  });

  it('defers instead of queueing while the gate or A5 lease is held, and says so after a day', () => {
    const { calls, done, holders, tick } = harness();
    try {
      holders.list = ['preview:resident-preview:123'];
      expect(tick(at(12))).toMatchObject({ action: 'deferred', busy: ['preview:resident-preview:123'] });
      expect(tick(at(12, 23) + HOUR).action).toBe('deferred');
      expect(tick(at(20, 23)).action).toBe('deferred');
      expect(calls.rounds).toEqual([]);
      expect(calls.notes).toHaveLength(1);
      expect(calls.notes[0]).toContain('推迟超过 24 小时');
      holders.list = [];
      expect(tick(at(20, 23) + HOUR / 2).action).toBe('round');
    } finally {
      done();
    }
  });

  it('cleans early when UD runs low, at most every six hours, and notifies once', () => {
    const { calls, done, space, tick } = harness({ ud: UD_LOW_BYTES - GIB });
    try {
      expect(tick(at(1))).toMatchObject({ action: 'round', reasons: ['ud-low'] });
      expect(tick(at(2)).action).toBe('idle');
      expect(tick(at(6)).action).toBe('idle');
      expect(tick(at(7))).toMatchObject({ reasons: ['ud-low'] });
      expect(tick(at(12)).action).toBe('idle'); // the low-space round already was today's full round
      space.ud = 200 * GIB;
      expect(tick(at(15)).action).toBe('idle');
      expect(calls.rounds).toEqual([['ud-low'], ['ud-low']]);
      expect(calls.notes.filter((note) => note.startsWith('UD 剩'))).toHaveLength(2);
    } finally {
      done();
    }
  });

  it('only notifies for a low internal disk, once a day, and reports an unmounted UD', () => {
    const { calls, done, tick } = harness({ internal: INTERNAL_LOW_BYTES - GIB });
    try {
      tick(at(1));
      tick(at(2));
      expect(calls.notes).toEqual([expect.stringContaining('内盘只剩')]);
      expect(calls.rounds).toEqual([]);
      expect(tick(at(3), { mounted: () => false }).action).toBe('ud-missing');
    } finally {
      done();
    }
  });

  it('installs a valid hourly LaunchAgent and removes only its own', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'foliole-cleanup-agent-'));
    const loaded = { value: false };
    const deps = {
      bootout: () => { loaded.value = false; }, bootstrap: () => { loaded.value = true; },
      lint: (plist) => expect(spawnSync('/usr/bin/plutil', ['-lint', plist]).status).toBe(0), loaded: () => loaded.value
    };
    try {
      const result = installCleanupAgent({ homeDirectory: root, nodePath: '/opt/homebrew/bin/node', repositoryRoot: '/repo' }, deps);
      const plist = fs.readFileSync(result.paths.plistPath, 'utf8');
      expect(plist).toContain('<key>StartInterval</key><integer>3600</integer>');
      expect(plist).toContain('<key>Hour</key><integer>19</integer><key>Minute</key><integer>20</integer>');
      expect(plist).toContain('/repo/scripts/macos/scheduled-disk-cleanup-tick.mjs');
      expect(loaded.value).toBe(true);
      expect(uninstallCleanupAgent({ homeDirectory: root }, deps)).toMatchObject({ removed: true });
      fs.writeFileSync(result.paths.plistPath, '<plist/>');
      expect(() => installCleanupAgent({ homeDirectory: root }, deps)).toThrow('Refusing unknown');
      expect(cleanupAgentXml({ logsDirectory: '/l', nodePath: '/n/node', repositoryRoot: '/a&b' })).toContain('/a&amp;b');
    } finally {
      fs.rmSync(root, { force: true, recursive: true });
    }
  });
});
