// @vitest-environment node

import fs from 'node:fs';

import { describe, expect, it } from 'vitest';

const deploy = fs.readFileSync('scripts/android/windows-deploy-app.ps1', 'utf8');
const adbDevice = fs.readFileSync('scripts/android/windows-adb-device.ps1', 'utf8');
const build = fs.readFileSync('scripts/android/windows-deploy-debug-build.ps1', 'utf8');
const cache = fs.readFileSync('scripts/android/windows-deploy-install-cache.ps1', 'utf8');

describe('fixed Windows deploy helper', () => {
  it('requires the adapter-owned ADB port and exact serial', () => {
    expect(deploy).toContain('[Parameter(Mandatory = $true)]');
    expect(deploy).toContain('[ValidateNotNullOrEmpty()]');
    expect(deploy).toContain('FOLIOLE_ANDROID_ADB_SERVER_PORT is required.');
    expect(deploy).toContain('$Arguments = @("-P", $env:FOLIOLE_ANDROID_ADB_SERVER_PORT) + $Arguments');
    expect(deploy).toContain('-TargetSerial $TargetSerial');
    expect(deploy).toContain('Required system Node executable not found: $NodeExe');
    expect(deploy).not.toContain('Get-Command node.exe');
    expect(adbDevice).toContain('if ($parts[0] -ne $TargetSerial)');
    expect(adbDevice).not.toContain('[string]$TargetSerial = ""');
  });

  it('keeps install cache identity and hidden bounded build/install behavior', () => {
    expect(deploy).toContain('. $installCacheScript');
    expect(deploy).toContain('. $debugBuildScript');
    expect(cache).toContain('function Test-InstallCacheHit');
    expect(cache).toContain('$cache.version -eq 3');
    expect(cache).toContain('android-install-cache.json');
    expect(build).toContain('gradlew.bat --no-daemon assembleDebug');
    expect(build).toContain('"install", "--no-incremental", "-r", $apkPath');
    expect(build).toContain('-PassThru -WindowStyle Hidden');
    expect(build).toContain('$process.WaitForExit()');
  });

  it('quiesces, launches, and verifies only the selected package and device', () => {
    expect(deploy).toContain('Stop-AppProcess -AdbPath $adbPath -Serial $serial -PackageName $AppId');
    expect(deploy).toContain('& $nodeExe $verifyScript --adb $adbPath --adb-server-port $env:FOLIOLE_ANDROID_ADB_SERVER_PORT --serial $serial');
    expect(deploy).toContain('Write-Info "status: OPENED"');
    expect(deploy).not.toContain('| Out-Null');
  });
});
