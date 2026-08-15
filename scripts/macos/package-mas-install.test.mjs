// @vitest-environment node
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { expect, it, vi } from 'vitest';

import { installMasDevelopmentApp } from './package-mas.mjs';

function createFixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'foliole-internal-install-'));
  const sourcePath = path.join(root, 'source/Foliole.app');
  const targetPath = path.join(root, 'Applications/Foliole.app');
  mkdirSync(sourcePath, { recursive: true });
  mkdirSync(targetPath, { recursive: true });
  writeFileSync(path.join(sourcePath, 'version'), 'new');
  writeFileSync(path.join(targetPath, 'version'), 'old');
  const run = vi.fn((command, args) => {
    if (command === 'ditto') cpSync(args[0], args[1], { recursive: true });
    return { status: 0 };
  });
  return { logEvent: vi.fn(), operationId: 'test-install', run, sourcePath, targetPath };
}

function readVersion(targetPath) {
  return readFileSync(path.join(targetPath, 'version'), 'utf8');
}

it('waits for a running Internal app before swapping and reopening it', async () => {
  const fixture = createFixture();
  const events = [];
  const running = [true, false];
  const log = vi.fn();
  const timeline = [];
  const lifecycle = {
    isRunning: vi.fn(() => running.shift()),
    quitAndWait: vi.fn(async () => events.push('quit')),
    open: vi.fn(() => events.push('open'))
  };

  await installMasDevelopmentApp({
    ...fixture, lifecycle, log, logEvent: (event) => timeline.push(event), operationId: 'install-1'
  });

  expect(events).toEqual(['quit', 'open']);
  expect(lifecycle.isRunning).toHaveBeenCalledTimes(2);
  expect(log).toHaveBeenCalledWith('[macos-package] stage: EXIT_CONFIRMED');
  expect(log).toHaveBeenCalledWith('[macos-package] stage: INSTALLED');
  expect(log).toHaveBeenCalledWith('[macos-package] stage: REOPENED');
  expect(timeline.map((entry) => entry.event)).toEqual([
    'install_started', 'staged_app_verified', 'quit_requested', 'exit_confirmed',
    'app_installed', 'background_reopen_requested', 'install_finished'
  ]);
  expect(timeline.every((entry) => entry.operationId === 'install-1')).toBe(true);
  expect(readVersion(fixture.targetPath)).toBe('new');
});

it('preserves the installed app when cooperative quit fails', async () => {
  const fixture = createFixture();
  const lifecycle = {
    isRunning: vi.fn(() => true),
    quitAndWait: vi.fn(async () => { throw new Error('quit denied'); }),
    open: vi.fn()
  };

  await expect(installMasDevelopmentApp({
    ...fixture, lifecycle, log: vi.fn()
  })).rejects.toThrow('quit denied');

  expect(readVersion(fixture.targetPath)).toBe('old');
  expect(lifecycle.open).not.toHaveBeenCalled();
});

it('does not disturb Internal when staged signature verification fails', async () => {
  const fixture = createFixture();
  fixture.run.mockImplementation((command, args) => {
    if (command === 'ditto') cpSync(args[0], args[1], { recursive: true });
    return { status: command === 'codesign' ? 1 : 0 };
  });
  const lifecycle = {
    isRunning: vi.fn(() => true),
    quitAndWait: vi.fn(),
    open: vi.fn()
  };

  await expect(installMasDevelopmentApp({
    ...fixture, lifecycle, log: vi.fn()
  })).rejects.toThrow('verify staged internal app failed');

  expect(readVersion(fixture.targetPath)).toBe('old');
  expect(lifecycle.isRunning).not.toHaveBeenCalled();
  expect(lifecycle.quitAndWait).not.toHaveBeenCalled();
});

it('restores the old app when the new app cannot reopen', async () => {
  const fixture = createFixture();
  const lifecycle = {
    isRunning: vi.fn(() => false),
    quitAndWait: vi.fn(),
    open: vi.fn()
      .mockImplementationOnce(() => { throw new Error('open failed'); })
      .mockImplementationOnce(() => undefined)
  };

  await expect(installMasDevelopmentApp({
    ...fixture, lifecycle, log: vi.fn()
  })).rejects.toThrow('open failed');

  expect(readVersion(fixture.targetPath)).toBe('old');
  expect(lifecycle.open).toHaveBeenCalledTimes(2);
});

it('restores the old app when Internal reopens in the final swap window', async () => {
  const fixture = createFixture();
  const running = [false, true];
  const lifecycle = {
    isRunning: vi.fn(() => running.shift()),
    quitAndWait: vi.fn(),
    open: vi.fn()
  };

  await expect(installMasDevelopmentApp({
    ...fixture, lifecycle, log: vi.fn()
  })).rejects.toThrow('reopened before the app swap');

  expect(existsSync(fixture.targetPath)).toBe(true);
  expect(readVersion(fixture.targetPath)).toBe('old');
});

it('reopens the untouched app when creating the backup fails', async () => {
  const fixture = createFixture();
  const lifecycle = {
    isRunning: vi.fn(() => false),
    quitAndWait: vi.fn(),
    open: vi.fn()
  };
  const move = vi.fn(async (source, target) => {
    if (source === fixture.targetPath) throw Object.assign(new Error('backup denied'), { code: 'EACCES' });
    renameSync(source, target);
  });

  await expect(installMasDevelopmentApp({
    ...fixture, lifecycle, log: vi.fn(), move
  })).rejects.toThrow('backup denied');

  expect(readVersion(fixture.targetPath)).toBe('old');
  expect(lifecycle.open).toHaveBeenCalledOnce();
});

it('preserves the only old-app backup when rollback restore fails', async () => {
  const fixture = createFixture();
  const stagingRoot = path.join(path.dirname(fixture.targetPath), 'known-staging');
  const backupPath = path.join(stagingRoot, 'previous.app');
  const lifecycle = {
    isRunning: vi.fn(() => false),
    quitAndWait: vi.fn(),
    open: vi.fn(() => { throw new Error('open failed'); })
  };
  const move = vi.fn(async (source, target) => {
    if (source === backupPath) throw Object.assign(new Error('restore denied'), { code: 'EACCES' });
    renameSync(source, target);
  });
  const makeTempDirectory = vi.fn(async () => {
    mkdirSync(stagingRoot, { recursive: true });
    return stagingRoot;
  });

  await expect(installMasDevelopmentApp({
    ...fixture, lifecycle, log: vi.fn(), makeTempDirectory, move
  })).rejects.toThrow(`previous app preserved at ${backupPath}`);

  expect(existsSync(backupPath)).toBe(true);
  expect(readVersion(backupPath)).toBe('old');
  expect(existsSync(fixture.targetPath)).toBe(false);
});
