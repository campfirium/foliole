// @vitest-environment node

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, expect, it, vi } from 'vitest';

import { canonicalizeLibraryPath } from '../lib/platform/syncGroupUnifiedContract.js';

import {
  loadDesktopDeviceIdentity,
  loadDesktopLibraryWriterBinding,
  loadOrCreateDesktopDeviceAnchor,
  resolveDesktopDeviceAnchorFilePath
} from './deviceAnchorStore.js';

const ANCHOR_A = '11111111-1111-4111-8111-111111111111';
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { force: true, recursive: true })));
});

it('uses the same macOS App Group location for DEV and signed package adapters', () => {
  const appGroupContainerPath = vi.fn(() => ({ ok: true as const, path: '/Users/me/Library/Group Containers/foliole' }));
  const options = { env: {}, loadAdapter: () => ({ adapter: { appGroupContainerPath }, status: 'ready' as const }),
    platform: 'darwin' as const };

  expect(resolveDesktopDeviceAnchorFilePath(options))
    .toBe('/Users/me/Library/Group Containers/foliole/device-identity/anchor-v1');
  expect(resolveDesktopDeviceAnchorFilePath(options))
    .toBe('/Users/me/Library/Group Containers/foliole/device-identity/anchor-v1');
  expect(appGroupContainerPath).toHaveBeenCalledTimes(2);
});

it('keeps Windows anchor outside channel-specific Roaming userData', () => {
  const options = {
    env: { LOCALAPPDATA: 'C:\\Users\\me\\AppData\\Local' },
    platform: 'win32' as const
  };
  const expected = 'C:\\Users\\me\\AppData\\Local\\Foliole\\device-identity\\anchor-v1';

  expect(resolveDesktopDeviceAnchorFilePath(options)).toBe(expected);
  expect(resolveDesktopDeviceAnchorFilePath(options)).toBe(expected);
});

it('uses the source build data root without opening the Foliole App Group', () => {
  const loadAdapter = vi.fn();
  expect(resolveDesktopDeviceAnchorFilePath({
    env: { FOLIOLE_BUILD_CHANNEL: 'source', FOLIOLE_USER_DATA_PATH: '/Users/me/Library/Application Support/foliole-source' },
    loadAdapter,
    platform: 'darwin'
  })).toBe('/Users/me/Library/Application Support/foliole-source/device-identity/anchor-v1');
  expect(loadAdapter).not.toHaveBeenCalled();
});

it('keeps desktop test device identity inside the isolated runtime root', () => {
  expect(resolveDesktopDeviceAnchorFilePath({
    env: { FOLIOLE_ELECTRON_TEST_STATE_ROOT: '/tmp/foliole-playwright-a' },
    platform: 'darwin'
  })).toBe('/tmp/foliole-playwright-a/device-identity/anchor-v1');
  expect(resolveDesktopDeviceAnchorFilePath({
    env: { FOLIOLE_ELECTRON_TEST_STATE_ROOT: 'D:\\Temp\\foliole-playwright-a' },
    platform: 'win32'
  })).toBe('D:\\Temp\\foliole-playwright-a\\device-identity\\anchor-v1');
});

it.each([
  { VITEST: 'true' },
  { FOLIOLE_ELECTRON_NATIVE_HIDDEN: '1' }
])('refuses the installed app group for automated macOS processes without isolated state (%o)', (env) => {
  const loadAdapter = vi.fn();
  expect(() => resolveDesktopDeviceAnchorFilePath({ env, loadAdapter, platform: 'darwin' }))
    .toThrow('device_anchor_test_state_root_required');
  expect(loadAdapter).not.toHaveBeenCalled();
});

it('gives every test worker an isolated device identity root', () => {
  const stateRoot = process.env.FOLIOLE_ELECTRON_TEST_STATE_ROOT;
  expect(stateRoot && path.isAbsolute(stateRoot)).toBe(true);
  // The state root uses the host's path form, so resolve it as the host platform does.
  const platform = process.platform === 'win32' ? 'win32' : 'darwin';
  expect(resolveDesktopDeviceAnchorFilePath({ platform }))
    .toBe(path.join(stateRoot!, 'device-identity', 'anchor-v1'));
});

it('keeps daily macOS DEV on the shared device identity despite its isolated runtime state', () => {
  const appGroupContainerPath = vi.fn(() => ({ ok: true as const, path: '/Users/me/Library/Group Containers/foliole' }));
  expect(resolveDesktopDeviceAnchorFilePath({
    env: {
      FOLIOLE_ELECTRON_TEST_STATE_ROOT: '/repo/.tmp/macos-desktop-daily-debug',
      FOLIOLE_MACOS_DAILY_DEBUG: '1',
      FOLIOLE_USER_DATA_PATH: '/repo/.tmp/macos-desktop-daily-debug/user-data'
    },
    loadAdapter: () => ({ adapter: { appGroupContainerPath }, status: 'ready' }),
    platform: 'darwin'
  })).toBe('/Users/me/Library/Group Containers/foliole/device-identity/anchor-v1');
});

it('creates one lowercase UUIDv4 and hydrates it after restart', async () => {
  const root = await temporaryRoot();
  const filePath = path.join(root, 'device-identity', 'anchor-v1');

  expect(await loadOrCreateDesktopDeviceAnchor(filePath, () => ANCHOR_A)).toBe(ANCHOR_A);
  expect(await loadOrCreateDesktopDeviceAnchor(filePath, () => { throw new Error('must not regenerate'); }))
    .toBe(ANCHOR_A);
  expect(await fs.readFile(filePath, 'utf8')).toBe(`${ANCHOR_A}\n`);
  if (process.platform !== 'win32') {
    expect((await fs.stat(path.dirname(filePath))).mode & 0o777).toBe(0o700);
    expect((await fs.stat(filePath)).mode & 0o777).toBe(0o600);
  }
});

it('fails closed for a corrupt shared anchor instead of changing Device identity', async () => {
  const root = await temporaryRoot();
  const filePath = path.join(root, 'anchor-v1');
  await fs.writeFile(filePath, 'corrupt\n');

  await expect(loadOrCreateDesktopDeviceAnchor(filePath)).rejects.toThrow('device_anchor_invalid');
});

it('uses the real database path before applying the shared composite identity', async () => {
  const root = await temporaryRoot();
  const libraryPath = path.join(root, 'library', 'Data', 'foliole.db');
  await fs.mkdir(path.dirname(libraryPath), { recursive: true });
  await fs.writeFile(libraryPath, 'fixture');
  const anchorFile = path.join(root, 'shared', 'anchor-v1');
  const result = await loadDesktopDeviceIdentity({
    anchorOptions: { env: { LOCALAPPDATA: path.join(root, 'local') },
      loadAdapter: () => ({ adapter: { appGroupContainerPath: () => ({ ok: true, path: path.dirname(anchorFile) }) }, status: 'ready' }),
      platform: process.platform === 'win32' ? 'win32' : 'darwin' },
    groupId: 'group-a',
    libraryPath,
    realpath: fs.realpath
  });

  const realLibraryPath = await fs.realpath(libraryPath);
  expect(result.identity.canonical_library_path).toBe(canonicalizeLibraryPath(
    realLibraryPath,
    process.platform === 'win32' ? 'windows' : 'posix'
  ));
  expect(result.identity.device_anchor).toMatch(/^[0-9a-f-]{36}$/u);
});

async function temporaryRoot() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-device-anchor-'));
  roots.push(root);
  return root;
}

it('binds offline writers to the same persistent anchor and real path used for pairing', async () => {
  const root = await temporaryRoot();
  const libraryPath = path.join(root, 'foliole.db');
  await fs.writeFile(libraryPath, 'fixture');
  const anchorOptions = { env: { FOLIOLE_ELECTRON_TEST_STATE_ROOT: root } };
  const offline = loadDesktopLibraryWriterBinding(libraryPath, anchorOptions);
  const paired = await loadDesktopDeviceIdentity({ anchorOptions, groupId: 'later-group', libraryPath });
  expect(offline).toEqual({ deviceAnchor: paired.identity.device_anchor,
    libraryPath: paired.identity.canonical_library_path });
  expect(loadDesktopLibraryWriterBinding(libraryPath, anchorOptions)).toEqual(offline);
  const clonePath = path.join(root, 'clone.db');
  await fs.copyFile(libraryPath, clonePath);
  expect(loadDesktopLibraryWriterBinding(clonePath, anchorOptions).libraryPath).not.toBe(offline.libraryPath);
});
