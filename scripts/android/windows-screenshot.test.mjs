// @vitest-environment node
/* global process */

import { chmod, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SCREENSHOT_SCRIPT = path.join(REPO_ROOT, 'scripts', 'android', 'windows-screenshot.sh');

function runScreenshot(cwd, args = [], env = {}) {
  return new Promise((resolve) => {
    const child = spawn('bash', [SCREENSHOT_SCRIPT, ...args], {
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

describe('windows-screenshot.sh', () => {
  it('passes the Windows output directory to the screenshot PowerShell script', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'android-screenshot-'));
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

      const outputDir = path.join(tempRoot, 'shots');
      const result = await runScreenshot(tempRoot, [outputDir], {
        FOLIOLE_ANDROID_SERIAL: 'phone-serial',
        PATH: `${bashPath(mockBinDir)}:/usr/bin:/bin:${process.env.PATH ?? ''}`,
        WINDOWS_SCRIPT_PATH: path.join(tempRoot, 'windows-screenshot.ps1'),
        POWERSHELL_ARGS_LOG: bashPath(powershellArgsLog)
      });

      expect(result.code).toBe(0);
      const args = (await readFile(powershellArgsLog, 'utf8')).split('\n').filter(Boolean);
      expect(args).toContain('-WindowStyle');
      expect(args).toContain('Hidden');
      expect(args).toContain('-File');
      expect(args.some((arg) => arg.endsWith('windows-screenshot.ps1'))).toBe(true);
      expect(args).toContain('-OutputDir');
      expect(args.some((arg) => arg.endsWith('shots'))).toBe(true);
      expect(args).toContain('-TargetSerial');
      expect(args).toContain('phone-serial');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('does not pipe adb executable calls through Out-Null', async () => {
    const script = await readFile(path.join(REPO_ROOT, 'scripts', 'android', 'windows-screenshot.ps1'), 'utf8');

    expect(script).toContain('function Test-LastCommandFailed');
    expect(script).toContain('function Invoke-ScreenshotCapture');
    expect(script).toContain('function Invoke-DeviceWake');
    expect(script).toContain('-ArgumentList ($AdbPrefix + @("-s", $Serial, "shell", "input", "keyevent", "KEYCODE_WAKEUP"))');
    expect(script).toContain('-ArgumentList ($AdbPrefix + @("-s", $Serial, "shell", "wm", "dismiss-keyguard"))');
    expect(script.indexOf('Invoke-DeviceWake -AdbPath')).toBeLessThan(script.indexOf('Invoke-ScreenshotCapture -AdbPath'));
    expect(script).toContain('-ArgumentList ($AdbPrefix + @("-s", $Serial, "exec-out", "screencap", "-p"))');
    expect(script).toContain('-RedirectStandardOutput $OutputPath');
    expect(script).toContain('& $adbPath @adbPrefix start-server *> $null');
    expect(script).toContain('$serial = $TargetSerial');
    expect(script).not.toContain('get-state');
    expect(script).toContain('$resolvedOutputDir = (Resolve-Path -LiteralPath $OutputDir).Path');
    expect(script).toContain('Invoke-ScreenshotCapture -AdbPath $adbPath -Serial $serial -AdbPrefix $adbPrefix -OutputPath $outputPath');
    expect(script).toContain('$devicesOutput = & $adbPath @adbPrefix devices 2>$null');
    expect(script).not.toContain('& $adbPath start-server |');
    expect(script).not.toContain(' pull ');
    expect(script).not.toContain(' shell rm ');
  });
});
