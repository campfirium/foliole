// @vitest-environment node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  closeOwnedDesktopLaunch,
  createDesktopLaunchIdentity,
  registerDesktopOwnership
} from './playwright-desktop-ownership.mjs';
import {
  findOwnedLaunchProcesses,
  parseMacProcessTable
} from './playwright-desktop-process-identity.mjs';

const temporaryRoots = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) fs.rmSync(root, { force: true, recursive: true });
});

function createFixture(overrides = {}) {
  const registryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'desktop-ownership-'));
  temporaryRoots.push(registryRoot);
  const appRoot = '/workspace/foliole';
  const executable = `${appRoot}/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron`;
  const mainEntry = `${appRoot}/dist/electron/main.js`;
  const stateRoot = '/tmp/foliole-state';
  const launchIdentity = createDesktopLaunchIdentity({ FOLIOLE_ELECTRON_PLAYWRIGHT_RUN_TOKEN: 'run-1' });
  const main = {
    pid: 4100,
    ppid: 4000,
    pgid: 4100,
    startTime: '2026-07-26T01:02:03.000Z',
    command: `${executable} ${mainEntry} ${launchIdentity.launchArg} ${stateRoot}`
  };
  const manager = { ...main, pid: 4000, pgid: 4000, command: 'node playwright' };
  return { appRoot, executable, launchIdentity, main, mainEntry, manager, registryRoot, stateRoot, ...overrides };
}

async function register(fixture, processTable = [fixture.manager, fixture.main]) {
  return registerDesktopOwnership({
    appRoot: fixture.appRoot,
    executable: fixture.executable,
    launchIdentity: fixture.launchIdentity,
    launchMode: fixture.launchMode ?? 'args',
    mainEntry: fixture.mainEntry,
    mainPid: fixture.main.pid,
    managerPid: fixture.manager.pid,
    registryRoot: fixture.registryRoot,
    stateRoot: fixture.stateRoot
  }, { platform: 'darwin', readProcessTable: async () => processTable });
}

describe('desktop launch ownership', () => {
  it('creates its own per-launch identity instead of inheriting one', () => {
    const identity = createDesktopLaunchIdentity({
      FOLIOLE_ELECTRON_PLAYWRIGHT_LAUNCH_ID: 'inherited-id',
      FOLIOLE_ELECTRON_PLAYWRIGHT_RUN_TOKEN: 'run-1'
    });
    expect(identity.launchId).not.toBe('inherited-id');
    expect(identity.runToken).toBe('run-1');
  });

  it('parses macOS process identity fields without losing the command', () => {
    const [entry] = parseMacProcessTable(
      ' 4100  4000  4100 Sun Jul 26 16:45:01 2026 /Applications/Electron --flag value\n'
    );
    expect(entry).toMatchObject({
      command: '/Applications/Electron --flag value', pid: 4100, pgid: 4100, ppid: 4000
    });
    expect(entry.startTime).toMatch(/^2026-07-26T/);
  });

  it('writes separate records for consecutive and concurrent launches in one run', async () => {
    const first = createFixture();
    const secondIdentity = createDesktopLaunchIdentity({ FOLIOLE_ELECTRON_PLAYWRIGHT_RUN_TOKEN: 'run-1' });
    const second = { ...first, launchIdentity: secondIdentity, main: {
      ...first.main, pid: 4200, pgid: 4200,
      command: `${first.executable} ${first.mainEntry} ${secondIdentity.launchArg} ${first.stateRoot}`
    } };
    const firstOwnership = await register(first);
    const secondOwnership = await register(second);
    expect(firstOwnership.recordPath).not.toBe(secondOwnership.recordPath);
    expect(fs.readdirSync(first.registryRoot)).toHaveLength(2);
  });

  it.each([
    ['installed launch', { launchMode: 'installed' }],
    ['external executable', { executable: '/Applications/Foliole.app/Contents/MacOS/Foliole' }],
    ['another checkout', { appRoot: '/workspace/other-foliole' }]
  ])('refuses %s ownership', async (_label, changes) => {
    const fixture = createFixture(changes);
    const result = await register(fixture);
    expect(result.managed).toBe(false);
  });

  it('refuses PID reuse and PGID mismatch', async () => {
    const fixture = createFixture();
    const ownership = await register(fixture);
    expect(findOwnedLaunchProcesses([{ ...fixture.main, startTime: '2026-07-26T02:00:00.000Z' }], ownership.record).reason)
      .toBe('main-identity-mismatch');
    expect(findOwnedLaunchProcesses([{ ...fixture.main, pgid: 9999 }], ownership.record).reason)
      .toBe('main-identity-mismatch');
  });

  it('accepts matching detached helpers and rejects weak state-root matches', async () => {
    const fixture = createFixture();
    const ownership = await register(fixture);
    const acceptedHelper = {
      ...fixture.main, pid: 4300, ppid: 1, pgid: 4300,
      command: `${fixture.executable} --type=crashpad ${fixture.stateRoot} ${fixture.launchIdentity.launchArg}`
    };
    const rejectedHelper = { ...acceptedHelper, pid: 4400, pgid: 4400, command: `${fixture.executable} ${fixture.stateRoot}` };
    const result = findOwnedLaunchProcesses([fixture.main, acceptedHelper, rejectedHelper], ownership.record);
    expect(result.accepted.map(({ pid }) => pid)).toEqual([4100, 4300]);
  });

  it('uses TERM then KILL and removes the record only after confirmed exit', async () => {
    const fixture = createFixture();
    const ownership = await register(fixture);
    const helper = {
      ...fixture.main, pid: 4300, ppid: 1, pgid: 4300,
      command: `${fixture.executable} ${fixture.stateRoot} ${fixture.launchIdentity.launchArg}`
    };
    const tables = [[fixture.main, helper], [helper], []];
    const kill = vi.fn();
    const result = await closeOwnedDesktopLaunch(ownership, {
      kill, readProcessTable: async () => tables.shift() ?? [], wait: async () => undefined
    });
    expect(kill.mock.calls).toEqual([
      [-4100, 'SIGTERM'], [-4300, 'SIGTERM'], [-4300, 'SIGKILL']
    ]);
    expect(result.confirmedExited).toBe(true);
    expect(fs.existsSync(ownership.recordPath)).toBe(false);
  });

  it('closes a verified detached helper after the main process already exited', async () => {
    const fixture = createFixture();
    const ownership = await register(fixture);
    const helper = {
      ...fixture.main, pid: 4300, ppid: 1, pgid: 4300,
      command: `${fixture.executable} ${fixture.stateRoot} ${fixture.launchIdentity.launchArg}`
    };
    const kill = vi.fn();
    const tables = [[helper], [], []];
    const result = await closeOwnedDesktopLaunch(ownership, {
      kill, readProcessTable: async () => tables.shift() ?? [], wait: async () => undefined
    });
    expect(kill).toHaveBeenCalledWith(-4300, 'SIGTERM');
    expect(result.confirmedExited).toBe(true);
  });

  it('keeps record and state authority when identity cannot be confirmed', async () => {
    const fixture = createFixture();
    const ownership = await register(fixture);
    const result = await closeOwnedDesktopLaunch(ownership, {
      readProcessTable: async () => [{ ...fixture.main, startTime: '2026-07-26T03:00:00.000Z' }]
    });
    expect(result).toMatchObject({ confirmedExited: false, reason: 'main-identity-mismatch' });
    expect(fs.existsSync(ownership.recordPath)).toBe(true);
  });
});
