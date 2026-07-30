// @vitest-environment node

import { expect, it, vi } from 'vitest';

import {
  resolveReceivePaths, runWindowsDevReceive, WINDOWS_DEV_RECEIVE_COMMAND
} from './windows-dev-receive.mjs';

it('resolves only the fixed Scoop Git and DEV bare repository', () => {
  expect(resolveReceivePaths({ LOCALAPPDATA: 'C:\\Users\\dev\\AppData\\Local', USERPROFILE: 'C:\\Users\\dev' }))
    .toEqual({
      gitPath: 'C:\\Users\\dev\\scoop\\apps\\git\\current\\cmd\\git.exe',
      repository: 'C:\\Users\\dev\\AppData\\Local\\Foliole\\windows-dev-git\\repository.git'
    });
});

it('spawns only receive-pack for the fixed command', () => {
  const child = { on: vi.fn() };
  const spawnImpl = vi.fn(() => child);
  const paths = { gitPath: 'C:\\git.exe', repository: 'C:\\repository.git' };
  expect(runWindowsDevReceive({
    env: { SSH_ORIGINAL_COMMAND: WINDOWS_DEV_RECEIVE_COMMAND }, paths, spawnImpl
  })).toBe(child);
  expect(spawnImpl).toHaveBeenCalledWith(
    paths.gitPath, ['receive-pack', paths.repository],
    { shell: false, stdio: 'inherit', windowsHide: true }
  );
});

it('rejects shell, delete, and legacy receive commands before spawning', () => {
  const spawnImpl = vi.fn();
  for (const command of [
    'whoami', "git-receive-pack 'foliole-android-lab.git'",
    "git-receive-pack 'foliole-dev.git' --delete"
  ]) {
    expect(() => runWindowsDevReceive({
      env: { SSH_ORIGINAL_COMMAND: command },
      paths: { gitPath: 'git.exe', repository: 'repository.git' }, spawnImpl
    })).toThrow('fixed receive-pack');
  }
  expect(spawnImpl).not.toHaveBeenCalled();
});
