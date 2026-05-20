// @vitest-environment node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { expect, it } from 'vitest';

import { resolveWindowsClientAction } from './windows-client-native.mjs';

it('defaults native Windows client actions to status', () => {
  expect(resolveWindowsClientAction(['node', 'script'])).toBe('status');
  expect(resolveWindowsClientAction(['node', 'script', 'restart'])).toBe('restart');
});

it('rejects unsupported native Windows client actions before process control', () => {
  expect(() => resolveWindowsClientAction(['node', 'script', 'sync'])).toThrow(
    'unsupported Windows client action: sync'
  );
});

it('uses Node-native process control instead of wrapping the legacy PowerShell client', async () => {
  const script = await readFile(path.resolve(process.cwd(), 'scripts/windows/windows-client-native.mjs'), 'utf8');

  expect(script).toContain("spawn(process.execPath, ['scripts/windows/electron-dev-native.mjs']");
  expect(script).toContain("stdio: ['ignore', logs.stdoutFd, logs.stderrFd]");
  expect(script).toContain("runCapture('taskkill.exe'");
  expect(script).not.toContain('.pipe(logs.');
  expect(script).not.toContain('powershell.exe');
  expect(script).not.toContain('restart-electron-dev.ps1');
  expect(script).not.toContain('buildPowerShellArgs');
});
