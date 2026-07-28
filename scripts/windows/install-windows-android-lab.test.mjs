// @vitest-environment node

import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('Windows Android lab installer', () => {
  it('creates an isolated limited interactive task and forced SSH command', () => {
    const source = fs.readFileSync('scripts/windows/install-windows-android-lab.ps1', 'utf8');
    expect(source).toContain('Foliole\\windows-android-lab');
    expect(source).toContain('FolioleAndroidLab');
    expect(source).toContain('-LogonType Interactive -RunLevel Limited');
    expect(source).toContain('no-agent-forwarding,no-port-forwarding,no-pty,no-user-rc');
    expect(source).toContain('[Parameter(Mandatory = $true)][string]$MacGitPublicKey');
    expect(source).toContain('windows-android-lab-git-repositories.mjs');
    expect(source).toContain('Failed to configure Android Lab Git repositories');
    expect(source).toContain('windows-android-lab-receive.mjs');
    expect(source).toContain('windows-android-lab-runtime-manifest.mjs');
    expect(source).toContain('$files = @(& $NodePath');
    expect(source).toContain('git-read-token.txt');
    expect(source).toContain('-ErrorAction SilentlyContinue');
    expect(source).not.toContain('RepositoryUrl');
    expect(source).not.toContain('GitReadToken');
    expect(source).toContain('[Parameter(Mandatory = $true)][string]$JavaHome');
    expect(source).toContain('Join-Path $nodeSourceRoot "npm.cmd"');
    expect(source).toContain('Copy-Item (Join-Path $nodeSourceRoot "*") $runtimeRoot -Recurse -Force');
    expect(source).toContain('"*${sid}:(OI)(CI)F"');
    expect(source).toContain('Failed to secure Android Lab install root');
    expect(source).toContain('[Parameter(Mandatory = $true)][string]$DeviceIdentity');
    expect(source).toContain('[string]$DeviceEndpoint = ""');
    expect(source).toContain('if ($DeviceEndpoint)');
    expect(source).toContain('Exactly one ready Android device must match DeviceEndpoint');
    expect(source).toContain('deviceIdentity = $DeviceIdentity');
    expect(source).toContain('schemaVersion = 2');
    expect(source).not.toContain("$files = @(\n");
    expect(source).toContain('$existingConfig.androidDebugKeystoreSha256');
    expect(source).toContain('$config.androidDebugKeystoreSha256 = $existingConfig.androidDebugKeystoreSha256');
    expect(source).toContain('$config.adbServerPort = $existingConfig.adbServerPort');
    expect(source).not.toMatch(/Remove-Item[^\n]*(repository\.git|device\.json|evidence)/u);
    expect(source).toContain('-RunLevel Limited');
    expect(source).not.toContain('FoliolePhysicalAcceptance');
  });
});
