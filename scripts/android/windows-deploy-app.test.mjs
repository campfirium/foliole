// @vitest-environment node
/* global process */

import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DEPLOY_SCRIPT = path.join(REPO_ROOT, 'scripts', 'android', 'windows-deploy-app.sh');
const ADB_DEVICE_SCRIPT = path.join(REPO_ROOT, 'scripts', 'android', 'windows-adb-device.ps1');
const DEPLOY_CACHE_SCRIPT = path.join(REPO_ROOT, 'scripts', 'android', 'windows-deploy-install-cache.ps1');
const DEPLOY_PS_SCRIPT = path.join(REPO_ROOT, 'scripts', 'android', 'windows-deploy-app.ps1');

function runDeploy(cwd, env = {}) {
  return new Promise((resolve) => {
    const child = spawn('bash', [DEPLOY_SCRIPT], {
      cwd,
      env: {
        ...process.env,
        ...env,
        PATH: `${cwd}${path.delimiter}${process.env.PATH}`
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

async function writeExecutable(rootDir, name, content) {
  const fullPath = path.join(rootDir, name);
  await writeFile(fullPath, content, { encoding: 'utf8', mode: 0o755 });
  return fullPath;
}

describe('windows-deploy-app.sh', () => {
  it('skips installDebug when the installed APK cache is valid', async () => {
    const script = await readFile(DEPLOY_PS_SCRIPT, 'utf8');
    const cacheScript = await readFile(DEPLOY_CACHE_SCRIPT, 'utf8');

    expect(script).toContain('. $installCacheScript');
    expect(cacheScript).toContain('function Test-InstallCacheHit');
    expect(cacheScript).toContain('function Get-WebAssetsHash');
    expect(cacheScript).toContain('function Get-NativeSourcesHash');
    expect(cacheScript).toContain('$cache.nativeSourcesHash -eq $NativeSourcesHash');
    expect(cacheScript).toContain('$cache.webAssetsHash -eq $WebAssetsHash');
    expect(cacheScript).toContain('$cache.version -eq 3');
    expect(cacheScript).toContain('android-install-cache.json');
    expect(script).toContain('install cache: HIT apk=$apkHash versionCode=$installedVersionCode');
    expect(script).toContain('Invoke-GradleWrapper -TaskName "installDebug"');
    expect(script).toContain('$nativeSourcesHash = Get-NativeSourcesHash -AndroidDir $androidDir');
    expect(script).toContain('Test-InstallCacheHit -ApkHash $apkHash -NativeSourcesHash $nativeSourcesHash -Serial $serial -VersionCode $installedVersionCode -WebAssetsHash $webAssetsHash -WindowsWorkDir $WindowsWorkDir');
    expect(script).toContain('Write-InstallCache -ApkHash $apkHash -NativeSourcesHash $nativeSourcesHash -Serial $serial -VersionCode $installedVersionCode -WebAssetsHash $webAssetsHash -WindowsWorkDir $WindowsWorkDir');
  });

  it('resolves Windows Node from node.exe or the npm.cmd sibling directory', async () => {
    const script = await readFile(DEPLOY_PS_SCRIPT, 'utf8');

    expect(script).toContain('Get-Command node.exe');
    expect(script).toContain('Get-Command npm.cmd');
    expect(script).toContain('Join-Path (Split-Path -Parent $npmCommand.Source) "node.exe"');
  });

  it('does not pipe adb executable calls through Out-Null', async () => {
    const script = await readFile(DEPLOY_PS_SCRIPT, 'utf8');
    const adbDeviceScript = await readFile(ADB_DEVICE_SCRIPT, 'utf8');

    expect(script).toContain('function Invoke-AdbCommand');
    expect(script).toContain('Invoke-AdbCommand -AdbPath $adbPath -Arguments @("start-server") *> $null');
    expect(script).toContain('-WindowStyle Hidden');
    expect(script).toContain('function Test-LastCommandFailed');
    expect(script).toContain('[string]$TargetSerial = ""');
    expect(script).toContain('. $adbDeviceScript');
    expect(adbDeviceScript).toContain('Resolve-AndroidDeviceSerialFromAdbDevices');
    expect(adbDeviceScript).toContain('Unlock the device and allow USB debugging.');
    expect(script).not.toContain('| Out-Null');
  });

  it('runs Gradle through a hidden cmd process', async () => {
    const script = await readFile(DEPLOY_PS_SCRIPT, 'utf8');

    expect(script).toContain('Start-Process -FilePath "cmd.exe" -ArgumentList @("/d", "/c", $gradleCommand) -Wait -PassThru -WindowStyle Hidden');
    expect(script).toContain('Start-Process -FilePath "cmd.exe" -ArgumentList @("/d", "/c", "call .\\gradlew.bat --stop") -Wait -PassThru -WindowStyle Hidden');
    expect(script).not.toContain('& cmd.exe /d /c');
  });

  it('refuses direct deploy without explicit data-risk confirmation', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'android-deploy-refuse-'));
    try {
      const result = await runDeploy(tempRoot);

      expect(result.code).toBe(2);
      expect(result.stderr).toContain('direct deploy can replace the active Android app package');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('returns after the Windows deploy script reports the app opened', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'android-deploy-'));
    try {
      await writeExecutable(
        tempRoot,
        'powershell.exe',
        '#!/usr/bin/env bash\nprintf "%s\\n" "$@"\necho "[android-deploy] status: OPENED"\nsleep 30\n'
      );

      const result = await runDeploy(tempRoot, {
        ANDROID_WINDOWS_WORKDIR: 'C:\\dev\\foliole-test',
        FOLIOLE_ANDROID_SERIAL: 'phone-serial',
        FOLIOLE_ANDROID_ALLOW_DIRECT_DEPLOY: '1'
      });

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('-WindowStyle');
      expect(result.stdout).toContain('Hidden');
      expect(result.stdout).toContain('-TargetSerial');
      expect(result.stdout).toContain('phone-serial');
      expect(result.stdout).toContain('[android-deploy] status: OPENED');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }, 30000);

  it('returns the Windows deploy failure code when the app is not opened', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'android-deploy-fail-'));
    try {
      await writeExecutable(
        tempRoot,
        'powershell.exe',
        '#!/usr/bin/env bash\necho "[android-deploy] failed before open"\nexit 42\n'
      );

      const result = await runDeploy(tempRoot, {
        ANDROID_WINDOWS_WORKDIR: 'C:\\dev\\foliole-test',
        FOLIOLE_ANDROID_ALLOW_DIRECT_DEPLOY: '1'
      });

      expect(result.code).toBe(42);
      expect(result.stdout).toContain('[android-deploy] failed before open');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }, 10000);
});
