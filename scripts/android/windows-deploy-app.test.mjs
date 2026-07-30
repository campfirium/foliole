// @vitest-environment node
/* global process */

import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DEPLOY_SCRIPT = path.join(REPO_ROOT, 'scripts', 'android', 'windows-deploy-app.sh');
const ADB_DEVICE_SCRIPT = path.join(REPO_ROOT, 'scripts', 'android', 'windows-adb-device.ps1');
const DEPLOY_BUILD_SCRIPT = path.join(REPO_ROOT, 'scripts', 'android', 'windows-deploy-debug-build.ps1');
const DEPLOY_CACHE_SCRIPT = path.join(REPO_ROOT, 'scripts', 'android', 'windows-deploy-install-cache.ps1');
const DEPLOY_PS_SCRIPT = path.join(REPO_ROOT, 'scripts', 'android', 'windows-deploy-app.ps1');
const BASH_SUPPORTS_COPROC = spawnSync('bash', ['-c', 'coproc true; wait "$!"'], {
  stdio: 'ignore'
}).status === 0;

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
  it('skips debug APK install when the installed APK cache is valid', async () => {
    const script = await readFile(DEPLOY_PS_SCRIPT, 'utf8');
    const buildScript = await readFile(DEPLOY_BUILD_SCRIPT, 'utf8');
    const cacheScript = await readFile(DEPLOY_CACHE_SCRIPT, 'utf8');

    expect(script).toContain('. $installCacheScript');
    expect(script).toContain('. $debugBuildScript');
    expect(cacheScript).toContain('function Test-InstallCacheHit');
    expect(cacheScript).toContain('function Get-WebAssetsHash');
    expect(cacheScript).toContain('function Get-NativeSourcesHash');
    expect(cacheScript).toContain('$cache.nativeSourcesHash -eq $NativeSourcesHash');
    expect(cacheScript).toContain('$cache.webAssetsHash -eq $WebAssetsHash');
    expect(cacheScript).toContain('$cache.version -eq 3');
    expect(cacheScript).toContain('android-install-cache.json');
    expect(script).toContain('install cache: HIT apk=$apkHash versionCode=$installedVersionCode');
    expect(script).toContain('Install-DebugBuild -AdbPath $adbPath -AndroidDir $androidDir -Serial $serial');
    expect(script).toContain('function Stop-AppProcess');
    expect(script).toContain('"am", "force-stop", $PackageName');
    expect(script.indexOf('Stop-AppProcess -AdbPath $adbPath -Serial $serial -PackageName $AppId'))
      .toBeLessThan(script.indexOf('Write-Info "launching activity: $MainActivity"'));
    expect(buildScript).toContain('gradlew.bat --no-daemon assembleDebug');
    expect(buildScript).toContain('"install", "--no-incremental", "-r", $apkPath');
    expect(buildScript).toContain('Invoke-DeployProcess -FilePath $AdbPath -ArgumentList $arguments -SuccessPattern "^Success$" -TimeoutSeconds $InstallTimeoutSeconds');
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
    expect(script).toContain('$Arguments = @("-P", $env:FOLIOLE_ANDROID_ADB_SERVER_PORT) + $Arguments');
    expect(script).toContain('$env:ANDROID_ADB_SERVER_PORT = $env:FOLIOLE_ANDROID_ADB_SERVER_PORT');
    expect(script).toContain('Invoke-AdbCommand -AdbPath $adbPath -Arguments @("start-server") *> $null');
    expect(script).toContain('-WindowStyle Hidden');
    expect(script).toContain('function Test-LastCommandFailed');
    expect(script).toContain('[string]$TargetSerial = ""');
    expect(script).toContain('. $adbDeviceScript');
    expect(adbDeviceScript).toContain('Resolve-AndroidDeviceSerialFromAdbDevices');
    expect(adbDeviceScript).toContain('Unlock the device and allow USB debugging.');
    expect(script).not.toContain('| Out-Null');
  });

  it('runs Gradle and adb install through hidden timeout-bound processes', async () => {
    const script = await readFile(DEPLOY_PS_SCRIPT, 'utf8');
    const buildScript = await readFile(DEPLOY_BUILD_SCRIPT, 'utf8');

    expect(buildScript).toContain('Start-Process -FilePath $FilePath -ArgumentList $ArgumentList -PassThru -WindowStyle Hidden -RedirectStandardOutput $out -RedirectStandardError $err');
    expect(buildScript).toContain('Invoke-DeployProcess -FilePath "cmd.exe" -ArgumentList @("/d", "/c", "call .\\gradlew.bat --no-daemon assembleDebug") -SuccessPattern "BUILD SUCCESSFUL"');
    expect(buildScript).toContain('Invoke-DeployProcess -FilePath $AdbPath -ArgumentList $arguments -SuccessPattern "^Success$" -TimeoutSeconds $InstallTimeoutSeconds');
    expect(script).toContain('Start-Process -FilePath "cmd.exe" -ArgumentList @("/d", "/c", "call .\\gradlew.bat --stop") -Wait -PassThru -WindowStyle Hidden');
    expect(buildScript).toContain('Get-Content -Path $out, $err -ErrorAction SilentlyContinue');
    expect(script).toContain('if ($process.ExitCode -ne 0)');
    expect(buildScript).toContain('$process.WaitForExit()');
    expect(buildScript).toContain('if (!($lines -match $SuccessPattern))');
    expect(buildScript).toContain('throw "$FilePath exited with code $exitCode."');
    expect(buildScript).not.toContain('exit $process.ExitCode');
    expect(script.match(/\$global:LASTEXITCODE = \$process\.ExitCode/gu)).toHaveLength(1);
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

  it.runIf(BASH_SUPPORTS_COPROC)('returns after the Windows deploy script reports the app opened', async () => {
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

  it.runIf(BASH_SUPPORTS_COPROC)('returns the Windows deploy failure code when the app is not opened', async () => {
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

  it('duplicates the coprocess output descriptor before Bash clears it', async () => {
    const script = await readFile(DEPLOY_SCRIPT, 'utf8');

    expect(script).toContain('exec {DEPLOY_PS_OUTPUT_FD}<&"${DEPLOY_PS[0]}"');
    expect(script).toContain('read -r line <&"${DEPLOY_PS_OUTPUT_FD}"');
  });
});
