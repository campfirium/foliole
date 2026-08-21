// @vitest-environment node

import fs from 'node:fs';
import { expect, it, vi } from 'vitest';

import {
  parseWindowsDevControlArgs, runWindowsDevControl, WINDOWS_DEV_DEFAULT_SSH
} from './windows-dev-control.mjs';

it('accepts desktop preview as a fixed Windows DEV action', () => {
  expect(parseWindowsDevControlArgs([
    '--host', WINDOWS_DEV_DEFAULT_SSH, 'desktop-preview'
  ], {})).toMatchObject({ action: 'desktop-preview' });
});

it('accepts internal install as a fixed Windows DEV action', () => {
  expect(parseWindowsDevControlArgs([
    '--host', WINDOWS_DEV_DEFAULT_SSH, 'internal-install'
  ], {})).toMatchObject({ action: 'internal-install' });
});

it('accepts installed Internal launch as a fixed Windows DEV action', () => {
  expect(parseWindowsDevControlArgs([
    '--host', WINDOWS_DEV_DEFAULT_SSH, 'internal-open'
  ], {})).toMatchObject({ action: 'internal-open' });
});

it('pushes the Mac dev mirror before invoking desktop preview', async () => {
  const calls = [];
  await runWindowsDevControl({
    argv: ['desktop-preview'], env: {},
    executeGit: vi.fn(async (args) => { calls.push(['git', ...args]); return ''; }),
    executeSsh: vi.fn(async (args) => {
      calls.push(['ssh', ...args]);
      return '[windows-preview-native] status: STARTED\n';
    }),
    stdout: { write: vi.fn() }
  });
  expect(calls[0]).toContain('+dev:refs/heads/dev');
  expect(calls[1].at(-1)).toBe('desktop-preview');
});

it('aligns the fixed checkout before launching native preview', () => {
  const source = fs.readFileSync('scripts/windows/windows-dev-action.ps1', 'utf8');
  const pull = '& $systemNode $puller';
  const preview = '& $systemNode $systemNpmCli run windows:preview:native';
  expect(source).toContain('$Action -eq "desktop-preview"');
  expect(source).toContain(preview);
  expect(source.indexOf(pull)).toBeLessThan(source.indexOf(preview));
});

it('aligns the fixed checkout before installing the internal package', () => {
  const source = fs.readFileSync('scripts/windows/windows-dev-action.ps1', 'utf8');
  const pull = '& $systemNode $puller';
  const install = '& $systemNode $systemNpmCli run windows:package:internal:install';
  expect(source).toContain('$Action -eq "internal-install"');
  expect(source).toContain(install);
  expect(source.indexOf(pull)).toBeLessThan(source.indexOf(install));
});

it('aligns the fixed checkout before opening the installed Internal app', () => {
  const source = fs.readFileSync('scripts/windows/windows-dev-action.ps1', 'utf8');
  expect(source).toContain('$Action -eq "internal-open"');
  expect(source).toContain('& $systemNode $internalOpenRunner');
});
