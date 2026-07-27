// @vitest-environment node
/* global process */

import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SOURCE_SYNC_SCRIPT = path.join(REPO_ROOT, 'scripts', 'android', 'windows-source-sync.sh');
const SOURCE_SYNC_PS_SCRIPT = path.join(REPO_ROOT, 'scripts', 'android', 'windows-source-sync.ps1');

function bashPath(windowsPath) {
  return windowsPath.replace(/^([A-Za-z]):/, (_, drive) => `/${drive.toLowerCase()}`).replace(/\\/g, '/');
}

function runSourceSync(cwd, env = {}) {
  return new Promise((resolve) => {
    const child = spawn('bash', [SOURCE_SYNC_SCRIPT], {
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

describe('windows-source-sync', () => {
  it('uses robocopy without purging generated Android artifacts', async () => {
    const script = await readFile(SOURCE_SYNC_PS_SCRIPT, 'utf8');

    expect(script).toContain('$robocopyPath = Join-Path $env:SystemRoot "System32\\robocopy.exe"');
    expect(script).toContain('& $robocopyPath @args');
    expect(script).toContain('if ($null -eq $exitCode)');
    expect(script).toContain('"/E"');
    expect(script).toContain('"/IS"');
    expect(script).toContain('"/IT"');
    expect(script).not.toContain('"/MIR"');
    expect(script).not.toContain('"/PURGE"');
    expect(script).toContain('if ($exitCode -ge 8)');
    expect(script).toContain('status: SYNCED code=$exitCode');
    expect(script).toContain('android\\app\\src\\main\\assets\\public');
    expect(script).toContain('android\\capacitor-cordova-android-plugins');
    expect(script).toContain('android\\app\\src\\main\\assets\\capacitor.config.json');
    expect(script).toContain('android\\app\\src\\main\\assets\\capacitor.plugins.json');
    expect(script).toContain('android\\app\\src\\main\\res\\xml\\config.xml');
    expect(script).toContain('android\\app\\capacitor.build.gradle');
    expect(script).toContain('android\\capacitor.settings.gradle');
  });

  it('passes source and dedicated Android workspace to PowerShell', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'android-source-sync-'));
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

      const result = await runSourceSync(tempRoot, {
        PATH: `${bashPath(mockBinDir)}:/usr/bin:/bin:${process.env.PATH ?? ''}`,
        WINDOWS_SCRIPT_PATH: path.join(tempRoot, 'windows-source-sync.ps1'),
        ANDROID_WINDOWS_WORKDIR: 'C:\\dev\\foliole-android-preview',
        ANDROID_SOURCE_SYNC_SOURCE_DIR: tempRoot,
        POWERSHELL_ARGS_LOG: bashPath(powershellArgsLog)
      });

      expect(result.code).toBe(0);
      const args = (await readFile(powershellArgsLog, 'utf8')).split('\n').filter(Boolean);
      expect(args).toContain('-WindowStyle');
      expect(args).toContain('Hidden');
      expect(args).toContain('-SourceDir');
      expect(args.some((arg) => arg.includes(path.basename(tempRoot)))).toBe(true);
      expect(args).toContain('-WindowsWorkDir');
      expect(args).toContain('C:\\dev\\foliole-android-preview');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });
});
