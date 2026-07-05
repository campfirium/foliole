// @vitest-environment node
/* global process */

import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CONTROL_SCRIPT = path.join(REPO_ROOT, 'scripts', 'android', 'windows-control-device.sh');
const CONTROL_PS_SCRIPT = path.join(REPO_ROOT, 'scripts', 'android', 'windows-control-device.ps1');
const PACKAGE_JSON = path.join(REPO_ROOT, 'package.json');

function bashPath(windowsPath) {
  return windowsPath.replace(/^([A-Za-z]):/, (_, drive) => `/${drive.toLowerCase()}`).replace(/\\/g, '/');
}

function runControl(cwd, env = {}) {
  return new Promise((resolve) => {
    const child = spawn('bash', [CONTROL_SCRIPT], {
      cwd,
      env: { ...process.env, ...env }
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

describe('windows-control-device', () => {
  it('passes selected serial to hidden PowerShell control script', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'android-control-'));
    try {
      const mockBinDir = path.join(tempRoot, 'bin');
      const powershellArgsLog = path.join(tempRoot, 'powershell-args.log');
      await mkdir(mockBinDir, { recursive: true });
      await writeFile(
        path.join(mockBinDir, 'powershell.exe'),
        ['#!/usr/bin/env bash', 'set -euo pipefail', 'printf "%s\\n" "$@" > "${POWERSHELL_ARGS_LOG}"'].join('\n'),
        { encoding: 'utf8', mode: 0o755 }
      );
      await chmod(path.join(mockBinDir, 'powershell.exe'), 0o755);

      const result = await runControl(tempRoot, {
        FOLIOLE_ANDROID_SERIAL: 'phone-serial',
        PATH: `${bashPath(mockBinDir)}:/usr/bin:/bin:${process.env.PATH ?? ''}`,
        WINDOWS_SCRIPT_PATH: path.join(tempRoot, 'windows-control-device.ps1'),
        POWERSHELL_ARGS_LOG: bashPath(powershellArgsLog)
      });

      expect(result.code).toBe(0);
      const args = (await readFile(powershellArgsLog, 'utf8')).split('\n').filter(Boolean);
      expect(args).toContain('-WindowStyle');
      expect(args).toContain('Hidden');
      expect(args).toContain('-TargetSerial');
      expect(args).toContain('phone-serial');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('uses scrcpy without waiting on a terminal session', async () => {
    const script = await readFile(CONTROL_PS_SCRIPT, 'utf8');

    expect(script).toContain('Resolve-ScrcpyPath');
    expect(script).toContain('Resolve-AdbPath');
    expect(script).toContain('Get-FolioleScrcpyProcesses');
    expect(script).toContain('param([string]$Serial)');
    expect(script).toContain('CommandLine -like "*--serial=$Serial*"');
    expect(script).toContain('Get-FolioleScrcpyProcesses -Serial $serial');
    expect(script).toContain('Stop-ExtraFolioleScrcpyProcesses');
    expect(script).toContain('mirror: reused');
    expect(script).toContain('SCRCPY_PATH');
    expect(script).toContain('ADB_PATH');
    expect(script).toContain('Start-Process');
    expect(script).toContain('-WindowStyle Normal');
    expect(script).toContain('"--serial=$serial"');
    expect(script).toContain('"--stay-awake"');
    expect(script).not.toContain('"--turn-screen-off"');
    expect(script).toContain('"--no-audio"');
    expect(script).toContain('stay awake: enabled');
    expect(script).not.toContain('stay_on_while_plugged_in 0');
    expect(script).toContain('KEYCODE_WAKEUP');
    expect(script).not.toContain('KEYCODE_SLEEP');
    expect(script).toContain('screen wake: requested');
    expect(script).toContain('"--window-title=Foliole-Android"');
    expect(script).toContain('"--window-x=40"');
    expect(script).toContain('"--window-y=40"');
    expect(script).toContain('"--window-width=840"');
    expect(script).toContain('"--window-height=1530"');
    expect(script).not.toContain('Wait-ScrcpyWindow');
    expect(script).not.toContain('SetWindowPos');
    expect(script).not.toContain('Test-KeyguardLocked');
  });

  it('exposes android:control as a direct hidden PowerShell entry', async () => {
    const packageJson = JSON.parse(await readFile(PACKAGE_JSON, 'utf8'));

    expect(packageJson.scripts['android:control']).toContain('powershell.exe');
    expect(packageJson.scripts['android:control']).toContain('-WindowStyle Hidden');
    expect(packageJson.scripts['android:control']).toContain('windows-control-device.ps1');
  });
});
