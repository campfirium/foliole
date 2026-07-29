// @vitest-environment node

import fs from 'node:fs';
import { expect, it } from 'vitest';

const script = fs.readFileSync('scripts/windows/install-windows-device-debug.ps1', 'utf8');

it('installs only the standard SSH and interactive-task bridge', () => {
  expect(script).toContain('dism.exe /Online /Add-Capability /CapabilityName:OpenSSH.Server~~~~0.0.1.0');
  expect(script).not.toContain('Get-WindowsCapability');
  expect(script).toContain('-Profile Private');
  expect(script).toContain('-LogonType Interactive -RunLevel Limited');
  expect(script).toContain('FoliolePhysicalAcceptance');
  expect(script).toContain('install-windows-device-runtime.ps1 first');
  expect(script).toContain('[Console]::In.ReadToEnd().Trim()');
  expect(script).not.toMatch(/-Password|New-Service|Session 0|WinRM/u);
});

it('preserves existing SSH keys instead of replacing a shell key with a forced command', () => {
  expect(script).toContain('existing SSH keys were preserved');
  expect(script).not.toContain('authorized_keys');
  expect(script).not.toContain('forcedCommand');
  expect(script).not.toMatch(/command=.*windows-device-dispatcher/u);
});
