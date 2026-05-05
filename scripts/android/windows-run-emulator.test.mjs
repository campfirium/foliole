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
    expect(script).toContain('& $AdbPath reconnect offline');
    expect(script).toContain('& $AdbPath -s $serial emu kill');
    expect(script).toContain('Repair-OfflineEmulators -AdbPath $adbPath');
  });

  it('cold starts the AVD instead of loading a stale snapshot', async () => {
    const script = await readFile(WINDOWS_RUN_EMULATOR_SCRIPT, 'utf8');

    expect(script).toContain('"-avd", $AvdName, "-no-snapshot-load", "-timezone", $Timezone');
  });

  it('passes an explicit zoneinfo timezone to the emulator', async () => {
    const script = await readFile(WINDOWS_RUN_EMULATOR_SCRIPT, 'utf8');

    expect(script).toContain('[string]$Timezone = "Asia/Shanghai"');
    expect(script).toContain('Write-Info "timezone: $Timezone"');
    expect(script).toContain('getprop persist.sys.timezone');
    expect(script).toContain('restarting emulator with timezone: $Timezone');
  });
});
