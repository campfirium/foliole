// @vitest-environment node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const WINDOWS_RUN_EMULATOR_SCRIPT = path.join(REPO_ROOT, 'scripts', 'android', 'windows-run-emulator.ps1');

describe('windows-run-emulator.ps1', () => {
  it('repairs offline adb emulator transports before launching', async () => {
    const script = await readFile(WINDOWS_RUN_EMULATOR_SCRIPT, 'utf8');

    expect(script).toContain('function Get-OfflineEmulatorSerials');
    expect(script).toContain('Invoke-AdbCommand -AdbPath $AdbPath -Arguments @("reconnect", "offline") *> $null');
    expect(script).toContain('Invoke-AdbCommand -AdbPath $AdbPath -Arguments @("-s", $serial, "emu", "kill") *> $null');
    expect(script).toContain('Repair-OfflineEmulators -AdbPath $adbPath');
  });

  it('captures adb stdout without console shell wrappers or Out-Null pipes', async () => {
    const script = await readFile(WINDOWS_RUN_EMULATOR_SCRIPT, 'utf8');

    expect(script).toContain('function Invoke-AdbCommand');
    expect(script).toContain('Start-Process -FilePath $AdbPath -ArgumentList $Arguments');
    expect(script).toContain('-WindowStyle Hidden');
    expect(script).toContain('Get-Content -Path $out');
    expect(script).toContain('Invoke-AdbCommand -AdbPath $adbPath -Arguments @("start-server") *> $null');
    expect(script).not.toContain('& cmd.exe');
    expect(script).not.toContain('| Out-Null');
  });

  it('cold starts the AVD instead of loading a stale snapshot', async () => {
    const script = await readFile(WINDOWS_RUN_EMULATOR_SCRIPT, 'utf8');

    expect(script).toContain('-ArgumentList @("-avd", $AvdName, "-no-snapshot-load", "-timezone", $Timezone)');
    expect(script).toContain('-FilePath $emulatorPath `');
  });

  it('detaches the emulator process from the preview process tree', async () => {
    const script = await readFile(WINDOWS_RUN_EMULATOR_SCRIPT, 'utf8');

    expect(script).toContain('Start-Process `');
    expect(script).toContain('-FilePath $emulatorPath `');
    expect(script).toContain('-ArgumentList @("-avd", $AvdName, "-no-snapshot-load", "-timezone", $Timezone)');
    expect(script).toContain('-WindowStyle Minimized');
    expect(script).not.toContain('start ""Foliole Android Emulator"" /min');
    expect(script).not.toContain('-FilePath $cmdPath');
  });

  it('passes an explicit zoneinfo timezone to the emulator', async () => {
    const script = await readFile(WINDOWS_RUN_EMULATOR_SCRIPT, 'utf8');

    expect(script).toContain('[string]$Timezone = "Asia/Shanghai"');
    expect(script).toContain('Write-Info "timezone: $Timezone"');
    expect(script).toContain('"getprop", "persist.sys.timezone"');
    expect(script).toContain('restarting emulator with timezone: $Timezone');
  });
});
