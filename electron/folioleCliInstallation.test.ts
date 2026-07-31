import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const electronMocks = vi.hoisted(() => ({
  showOpenDialog: vi.fn(),
  stopAccess: vi.fn(),
  userData: ''
}));

vi.mock('electron', () => ({
  app: {
    get isPackaged() { return true; },
    getPath: () => electronMocks.userData,
    startAccessingSecurityScopedResource: () => electronMocks.stopAccess
  },
  dialog: { showOpenDialog: electronMocks.showOpenDialog }
}));

import {
  inspectFolioleCliInstallation,
  resolvePackagedFolioleCliPath,
  runFolioleCliInstallAction
} from './folioleCliInstallation.js';

const roots: string[] = [];
let originalPlatform: PropertyDescriptor | undefined;

beforeEach(() => {
  originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
  Object.defineProperty(process, 'platform', { configurable: true, value: 'darwin' });
  Object.defineProperty(process, 'mas', { configurable: true, value: true });
  electronMocks.showOpenDialog.mockReset();
  electronMocks.stopAccess.mockReset();
});

afterEach(async () => {
  Reflect.deleteProperty(process, 'mas');
  Reflect.deleteProperty(process, 'resourcesPath');
  if (originalPlatform) Object.defineProperty(process, 'platform', originalPlatform);
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { force: true, recursive: true })));
});

async function preparePackagedRuntime(name = 'current') {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), `foliole-cli-${name}-`));
  roots.push(root);
  const resources = path.join(root, 'Foliole.app/Contents/Resources');
  const target = resolvePackagedFolioleCliPath(resources);
  electronMocks.userData = path.join(root, 'user-data');
  Object.defineProperty(process, 'resourcesPath', { configurable: true, value: resources });
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, '#!/bin/sh\n');
  await fs.chmod(target, 0o755);
  return { root, target };
}

it('resolves the public command inside the packaged CLI wrapper', () => {
  expect(resolvePackagedFolioleCliPath('/Applications/Foliole.app/Contents/Resources')).toBe(
    '/Applications/Foliole.app/Contents/Helpers/Foliole CLI.app/Contents/MacOS/foliole'
  );
});

it('distinguishes installed, moved, and conflicting commands without overwriting them', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-cli-install-'));
  roots.push(directory);
  const commandPath = path.join(directory, 'foliole');
  const oldTarget = path.join(directory, 'old-cli');
  const currentTarget = path.join(directory, 'current-cli');
  const receipt = { bookmark: 'bookmark', directory, target: oldTarget };

  await fs.symlink(currentTarget, commandPath);
  await expect(inspectFolioleCliInstallation(receipt, currentTarget)).resolves.toMatchObject({ status: 'installed' });
  await fs.unlink(commandPath);
  await fs.symlink(oldTarget, commandPath);
  await expect(inspectFolioleCliInstallation(receipt, currentTarget)).resolves.toMatchObject({ status: 'repair_required' });
  await fs.unlink(commandPath);
  await fs.writeFile(commandPath, 'third party');
  await expect(inspectFolioleCliInstallation(receipt, currentTarget)).resolves.toMatchObject({
    error: 'conflict', status: 'conflict'
  });
});

it('cancels without writing and installs idempotently with an atomic receipt', async () => {
  const { root, target } = await preparePackagedRuntime();
  const directory = path.join(root, 'bin');
  await fs.mkdir(directory);
  electronMocks.showOpenDialog.mockResolvedValueOnce({ canceled: true, filePaths: [] });
  await expect(runFolioleCliInstallAction('install', null)).resolves.toMatchObject({ status: 'cancelled' });

  electronMocks.showOpenDialog.mockResolvedValue({
    bookmarks: ['bookmark'], canceled: false, filePaths: [directory]
  });
  await expect(runFolioleCliInstallAction('install', null)).resolves.toMatchObject({ status: 'installed' });
  await expect(runFolioleCliInstallAction('install', null)).resolves.toMatchObject({ status: 'installed' });
  expect(await fs.readlink(path.join(directory, 'foliole'))).toBe(target);
  const receipt = JSON.parse(await fs.readFile(
    path.join(electronMocks.userData, 'foliole-cli-installation.json'), 'utf8'
  ));
  expect(receipt).toEqual({ bookmark: 'bookmark', directory, target });
  await expect(fs.access(path.join(electronMocks.userData, 'foliole-cli-installation.json.tmp'))).rejects.toThrow();
  expect(electronMocks.stopAccess).toHaveBeenCalledTimes(2);
});

it('restores status after restart and protects a third-party replacement during removal', async () => {
  const { root } = await preparePackagedRuntime();
  const directory = path.join(root, 'bin');
  const commandPath = path.join(directory, 'foliole');
  await fs.mkdir(directory);
  electronMocks.showOpenDialog.mockResolvedValue({
    bookmarks: ['bookmark'], canceled: false, filePaths: [directory]
  });
  await runFolioleCliInstallAction('install', null);
  await expect(runFolioleCliInstallAction('status', null)).resolves.toMatchObject({ status: 'installed' });

  await fs.unlink(commandPath);
  await fs.writeFile(commandPath, 'third party');
  await expect(runFolioleCliInstallAction('remove', null)).resolves.toMatchObject({ status: 'conflict' });
  await expect(fs.readFile(commandPath, 'utf8')).resolves.toBe('third party');
});

it('repairs the managed link after the packaged app moves and then removes it', async () => {
  const first = await preparePackagedRuntime('first');
  const directory = path.join(first.root, 'bin');
  await fs.mkdir(directory);
  electronMocks.showOpenDialog.mockResolvedValue({
    bookmarks: ['bookmark'], canceled: false, filePaths: [directory]
  });
  await runFolioleCliInstallAction('install', null);
  const stableUserData = electronMocks.userData;
  const second = await preparePackagedRuntime('second');
  electronMocks.userData = stableUserData;

  await expect(runFolioleCliInstallAction('status', null)).resolves.toMatchObject({ status: 'repair_required' });
  await expect(runFolioleCliInstallAction('repair', null)).resolves.toMatchObject({ status: 'installed' });
  expect(await fs.readlink(path.join(directory, 'foliole'))).toBe(second.target);
  await expect(runFolioleCliInstallAction('remove', null)).resolves.toMatchObject({ status: 'not_installed' });
  await expect(fs.access(path.join(directory, 'foliole'))).rejects.toThrow();
});
