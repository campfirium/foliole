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

it('locks the dedicated key to the dispatcher without PTY or forwarding', () => {
  expect(script).toContain('command=`"$NodePath $dispatcher`"');
  expect(script).toContain('no-agent-forwarding,no-port-forwarding,no-pty');
  expect(script).toContain('administrators_authorized_keys');
  expect(script).toContain('$retained + $forcedCommand');
});
