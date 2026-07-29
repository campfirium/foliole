// @vitest-environment node

import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = fs.readFileSync('scripts/windows/configure-windows-development-ssh.ps1', 'utf8');

describe('Windows development SSH configuration', () => {
  it('installs one ordinary shell key and keeps Git receive on a dedicated forced key', () => {
    expect(source).toContain('no-agent-forwarding,no-port-forwarding,no-X11-forwarding,no-user-rc $($MacPublicKey.Trim())');
    expect(source).toContain('command=`"$NodePath $ReceiverPath`",no-agent-forwarding,no-port-forwarding,no-pty,no-user-rc');
    expect(source).toContain('$retained + $shellKey + $gitKey');
    expect(source).not.toMatch(/command=.*MacPublicKey/u);
  });

  it('rejects multiline, malformed, or reused key material before rewriting authorized_keys', () => {
    expect(source).toContain("$PublicKey -match '[\\r\\n]'");
    expect(source).toContain('$parts[0] -ne "ssh-ed25519"');
    expect(source).toContain('$shellKeyBody -eq $gitKeyBody');
    expect(source).toContain('$decoded.Length -ne 51');
    expect(source).toContain('[System.Text.UTF8Encoding]::new($false)');
    expect(source).toContain('administrators_authorized_keys');
    expect(source).toContain('"*S-1-5-32-544:F"');
  });

  it('targets the administrators key file from account membership instead of token elevation', () => {
    expect(source).toContain('$identity.Groups | ForEach-Object { $_.Value }');
    expect(source).toContain('$isAdministratorAccount');
    expect(source).toContain('$isElevated');
    expect(source).toContain('Windows development SSH must be configured from an elevated PowerShell');
    expect(source).toContain('[Environment]::GetFolderPath("CommonApplicationData")');
    expect(source).not.toContain('$sshDirectory = if ($isAdministrator)');
  });

  it('sets PowerShell as the ordinary OpenSSH shell and restarts sshd', () => {
    expect(source).toContain('(Get-Command powershell.exe -ErrorAction Stop).Source');
    expect(source).toContain('"HKLM:\\SOFTWARE\\OpenSSH"');
    expect(source).toContain('-Name "DefaultShell"');
    expect(source).toContain('Restart-Service -Name sshd -ErrorAction Stop');
  });

  it('puts the verified Node and Git directories ahead of reparse-point shims', () => {
    expect(source).toContain('[string]$GitPath = ""');
    expect(source).toContain('ConvertFrom-Json).gitPath');
    expect(source).toContain('$developmentPathEntries');
    expect(source).toContain('[Environment]::SetEnvironmentVariable("Path"');
    expect(source).toContain('$retainedUserPath');
  });
});
