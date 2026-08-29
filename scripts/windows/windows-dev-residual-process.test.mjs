// @vitest-environment node

import path from 'node:path';
import { expect, it } from 'vitest';

import { allowsSyncGroupNativeClient } from './windows-dev-residual-process.mjs';

it('allows one exact trusted runtime to remain untouched during frozen preflight', () => {
  const paths = { repoRoot: 'D:\\C\\foliole',
    systemNode: 'C:\\Program Files\\nodejs\\node.exe' };
  const script = path.win32.join(paths.repoRoot, 'scripts', 'windows', 'electron-dev-native.mjs');
  const runtime = { CommandLine: `/d /c ""${paths.systemNode}" "${script}""`,
    Name: 'cmd.exe', ProcessId: 42 };
  expect(allowsSyncGroupNativeClient('frozen-revision-preflight', [runtime], paths)).toBe(true);
  expect(allowsSyncGroupNativeClient('desktop-dnssd-route-prepare', [runtime], paths)).toBe(true);
  expect(allowsSyncGroupNativeClient('desktop-dnssd-route-provider', [runtime], paths)).toBe(true);
  expect(allowsSyncGroupNativeClient('desktop-dnssd-find-diagnostic', [runtime], paths)).toBe(true);
  expect(allowsSyncGroupNativeClient('frozen-revision-preflight', [], paths)).toBe(false);
});
