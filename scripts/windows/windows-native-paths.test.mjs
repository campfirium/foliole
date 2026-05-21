// @vitest-environment node

import path from 'node:path';
import process from 'node:process';

import { expect, it } from 'vitest';

import { resolveWindowsNativePaths, WINDOWS_NATIVE_REPO_ROOT } from './windows-native-paths.mjs';

it('resolves Windows native runtime paths from the current checkout', () => {
  const paths = resolveWindowsNativePaths();

  expect(WINDOWS_NATIVE_REPO_ROOT).toBe(path.resolve(process.cwd()));
  expect(paths.userDataPath).toBe(path.join(process.cwd(), '.electron-user-data'));
  expect(paths.appReadyFile).toBe(path.join(process.cwd(), '.windows-native-boot-ready.json'));
  expect(paths.bridgeReadyFile).toBe(path.join(process.cwd(), '.windows-native-bridge-ready.json'));
  expect(paths.windowVisibleFile).toBe(path.join(process.cwd(), '.windows-native-window-visible.json'));
  expect(paths.clientScript).toBe(path.join(process.cwd(), 'scripts', 'windows', 'windows-client-native.mjs'));
  expect(paths.nativeAbiScript).toBe(path.join(process.cwd(), 'scripts', 'windows', 'native-abi-preflight.ps1'));
  expect(paths.nativeStartScript).toBe(path.join(process.cwd(), 'scripts', 'windows', 'start-electron-dev-native.ps1'));
  expect(paths.restartDeliveryFile).toBe(path.join(process.cwd(), '.windows-dev-restart-delivered.json'));
  expect(paths.reloadDeliveryFile).toBe(path.join(process.cwd(), '.windows-dev-renderer-reload-delivered.json'));
});
