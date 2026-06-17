// @vitest-environment node
/* global process */

import { chmod, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CAP_SYNC_SCRIPT = path.join(REPO_ROOT, 'scripts', 'android', 'windows-cap-sync.sh');
const CAP_SYNC_PS_SCRIPT = path.join(REPO_ROOT, 'scripts', 'android', 'windows-cap-sync.ps1');

function runCapSync(cwd, env = {}) {
  return new Promise((resolve) => {
    const child = spawn('bash', [CAP_SYNC_SCRIPT], {
      cwd,
      env: {
        ...process.env,
        ...env
      }
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('close', (code) => {
      resolve({ code, stderr, stdout });
    });
  });
}

function bashPath(windowsPath) {
  return windowsPath.replace(/^([A-Za-z]):/, (_, drive) => `/${drive.toLowerCase()}`).replace(/\\/g, '/');
}

async function writeExecutable(rootDir, relativePath, content) {
  const fullPath = path.join(rootDir, relativePath);
  await writeFile(fullPath, content, { encoding: 'utf8', mode: 0o755 });
  return fullPath;
}

describe('windows-cap-sync.sh', () => {
  it('skips web build and cap sync when the input cache is valid', async () => {
    const script = await readFile(CAP_SYNC_PS_SCRIPT, 'utf8');

    expect(script).toContain('function Get-CapSyncInputHash');
    expect(script).toContain('function Test-CapSyncInputFile');
    expect(script).toContain('\\.(test|spec)\\.[^/]+$');
    expect(script).toContain('android-cap-sync-cache.json');
    expect(script).toContain('Test-CapSyncCacheHit -InputHash $inputHash');
    expect(script).toContain('cache: HIT input=$inputHash');
    expect(script).toContain('Write-CapSyncCache -InputHash $inputHash');
  });

  it('does not treat a blank PowerShell last exit code as npm install failure', async () => {
    const script = await readFile(CAP_SYNC_PS_SCRIPT, 'utf8');

    expect(script).toContain('function Test-LastCommandFailed');
    expect(script).toContain('return $null -ne $LASTEXITCODE -and $LASTEXITCODE -ne 0');
    expect(script).not.toContain('if ($LASTEXITCODE -ne 0)');
  });

  it('runs Windows cmd shims through Start-Process and verifies refreshed web assets', async () => {
    const script = await readFile(CAP_SYNC_PS_SCRIPT, 'utf8');

    expect(script).toContain('function Invoke-CmdTool');
    expect(script).toContain('function Invoke-NodeTool');
    expect(script).toContain('$env:Path = "$toolDir;$env:Path"');
    expect(script).toContain('Start-Process');
    expect(script).toContain('-ArgumentList $Arguments');
    expect(script).toContain('-FilePath $CommandPath');
    expect(script).toContain('-WorkingDirectory $WindowsWorkDir');
    expect(script).toContain('-WindowStyle Hidden');
    expect(script).not.toContain('-NoNewWindow');
    expect(script).toContain('if ($process.ExitCode -ne 0)');
    expect(script).toContain('Invoke-NodeTool -Arguments @("scripts\\android\\generate-companion-schema.mjs")');
    expect(script).toContain('Invoke-NodeTool -Arguments @("node_modules\\vite\\bin\\vite.js", "build", "--config", "vite.companion.config.ts")');
    expect(script).toContain('Invoke-NodeTool -Arguments @($capCliPath, "sync", "android")');
    expect(script).toContain('function Assert-FileExists');
    expect(script).toContain('Remove-Item -Path $webOutDir -Recurse -Force');
    expect(script).toContain('Remove-Item -Path $androidPublicDir -Recurse -Force');
    expect(script).toContain('Android companion web build did not produce dist\\companion\\index.html.');
    expect(script).toContain('Capacitor Android sync did not produce android app web assets.');
  });

  it('defaults sync and PowerShell calls to the dedicated Android workspace', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'android-cap-sync-default-workdir-'));
    try {
      const mockBinDir = path.join(tempRoot, 'bin');
      const powershellArgsLog = path.join(tempRoot, 'powershell-args.log');
      await mkdir(mockBinDir, { recursive: true });
      const sourceSync = await writeExecutable(tempRoot, 'source-sync.sh', '#!/usr/bin/env bash\necho cap-source-sync:${ANDROID_WINDOWS_WORKDIR}\n');
      await writeFile(
        path.join(mockBinDir, 'powershell.exe'),
        ['#!/usr/bin/env bash', 'set -euo pipefail', 'printf "%s\\n" "$@" > "${POWERSHELL_ARGS_LOG}"'].join('\n'),
        { encoding: 'utf8', mode: 0o755 }
      );
      await chmod(path.join(mockBinDir, 'powershell.exe'), 0o755);

      const result = await runCapSync(tempRoot, {
        PATH: `${bashPath(mockBinDir)}:/usr/bin:/bin:${process.env.PATH ?? ''}`,
        ANDROID_SOURCE_SYNC_SCRIPT: sourceSync,
        WINDOWS_SCRIPT_PATH: path.join(tempRoot, 'windows-cap-sync.ps1'),
        POWERSHELL_ARGS_LOG: bashPath(powershellArgsLog)
      });

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('cap-source-sync:C:\\dev\\foliole-android-preview');
      const args = (await readFile(powershellArgsLog, 'utf8')).split('\n').filter(Boolean);
      expect(args).toContain('-WindowStyle');
      expect(args).toContain('Hidden');
      expect(args).toContain('-WindowsWorkDir');
      expect(args).toContain('C:\\dev\\foliole-android-preview');
      expect(args).not.toContain('C:\\dev\\foliole');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('passes dependency refresh mode to the Windows PowerShell sync script', async () => {
    const tempRoot = await mkdtemp(path.join(REPO_ROOT, '.tmp', 'android-cap-sync-'));
    try {
      const mockBinDir = path.join(tempRoot, 'bin');
      const powershellArgsLog = path.join(tempRoot, 'powershell-args.log');
      await mkdir(mockBinDir, { recursive: true });
      const sourceSync = await writeExecutable(tempRoot, 'source-sync.sh', '#!/usr/bin/env bash\necho cap-source-sync:${ANDROID_WINDOWS_WORKDIR}\n');
      await writeFile(
        path.join(mockBinDir, 'powershell.exe'),
        ['#!/usr/bin/env bash', 'set -euo pipefail', 'printf "%s\\n" "$@" > "${POWERSHELL_ARGS_LOG}"'].join('\n'),
        { encoding: 'utf8', mode: 0o755 }
      );
      await writeFile(
        path.join(mockBinDir, 'wslpath'),
        ['#!/usr/bin/env bash', 'set -euo pipefail', 'if [[ "$1" == "-w" ]]; then echo "$2"; else echo "/tmp/mock-wslpath"; fi'].join('\n'),
        { encoding: 'utf8', mode: 0o755 }
      );
      await chmod(path.join(mockBinDir, 'powershell.exe'), 0o755);
      await chmod(path.join(mockBinDir, 'wslpath'), 0o755);

      const mirrorDir = path.join(tempRoot, 'android-preview-mirror');
      const mirrorDirForBash = bashPath(mirrorDir);
      const result = await runCapSync(tempRoot, {
        PATH: `${bashPath(mockBinDir)}:/usr/bin:/bin:${process.env.PATH ?? ''}`,
        ANDROID_SOURCE_SYNC_SCRIPT: sourceSync,
        WINDOWS_SCRIPT_PATH: path.join(tempRoot, 'windows-cap-sync.ps1'),
        ANDROID_WINDOWS_MIRROR_DIR: mirrorDirForBash,
        ANDROID_WINDOWS_WORKDIR: 'C:\\dev\\foliole-test',
        ANDROID_WINDOWS_DEPENDENCY_REFRESH: 'skip',
        POWERSHELL_ARGS_LOG: bashPath(powershellArgsLog)
      });

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('cap-source-sync:C:\\dev\\foliole-test');
      const args = (await readFile(powershellArgsLog, 'utf8')).split('\n').filter(Boolean);
      expect(args).toContain('-DependencyRefresh');
      expect(args).toContain('skip');
      expect(args).toContain('-WindowsWorkDir');
      expect(args).toContain('C:\\dev\\foliole-test');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });
});
