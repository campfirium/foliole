// @vitest-environment node

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, expect, it, vi } from 'vitest';

import {
  loadDesktopDeviceIdentity,
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
  const options = { loadAdapter: () => ({ adapter: { appGroupContainerPath }, status: 'ready' as const }),
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

it('creates one lowercase UUIDv4 and hydrates it after restart', async () => {
  const root = await temporaryRoot();
  const filePath = path.join(root, 'device-identity', 'anchor-v1');

  expect(await loadOrCreateDesktopDeviceAnchor(filePath, () => ANCHOR_A)).toBe(ANCHOR_A);
  expect(await loadOrCreateDesktopDeviceAnchor(filePath, () => { throw new Error('must not regenerate'); }))
    .toBe(ANCHOR_A);
  expect(await fs.readFile(filePath, 'utf8')).toBe(`${ANCHOR_A}\n`);
  expect((await fs.stat(path.dirname(filePath))).mode & 0o777).toBe(0o700);
  expect((await fs.stat(filePath)).mode & 0o777).toBe(0o600);
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
    anchorOptions: { loadAdapter: () => ({ adapter: { appGroupContainerPath: () => ({ ok: true, path: path.dirname(anchorFile) }) }, status: 'ready' }), platform: 'darwin' },
    groupId: 'group-a',
    libraryPath,
    realpath: fs.realpath
  });

  expect(result.identity.canonical_library_path).toBe(await fs.realpath(libraryPath));
  expect(result.identity.device_anchor).toMatch(/^[0-9a-f-]{36}$/u);
});

async function temporaryRoot() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-device-anchor-'));
  roots.push(root);
  return root;
}
