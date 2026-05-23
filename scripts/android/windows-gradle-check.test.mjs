// @vitest-environment node
/* global process */

import { chmod, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const GRADLE_CHECK_SCRIPT = path.join(REPO_ROOT, 'scripts', 'android', 'windows-gradle-check.sh');

function runGradleCheck(cwd, args, env = {}) {
  return new Promise((resolve) => {
    const child = spawn('bash', [GRADLE_CHECK_SCRIPT, ...args], {
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

describe('windows-gradle-check.sh', () => {
  it('runs Gradle checks in the dedicated Android preview workspace', async () => {
    const tempRoot = await mkdtemp(path.join(REPO_ROOT, '.tmp', 'android-gradle-check-'));
    try {
      const mockBinDir = path.join(tempRoot, 'bin');
      const powershellArgsLog = path.join(tempRoot, 'powershell-args.log');
      await mkdir(mockBinDir, { recursive: true });
      await writeExecutable(tempRoot, 'windows-sync.sh', '#!/usr/bin/env bash\necho sync-target:${WINDOWS_MIRROR_DIR}\n');
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
      const result = await runGradleCheck(tempRoot, ['lint'], {
        PATH: `${bashPath(mockBinDir)}:/usr/bin:/bin:${process.env.PATH ?? ''}`,
        WINDOWS_SYNC_SCRIPT: path.join(tempRoot, 'windows-sync.sh'),
        WINDOWS_SCRIPT_PATH: path.join(tempRoot, 'windows-gradle-check.ps1'),
        ANDROID_WINDOWS_MIRROR_DIR: mirrorDirForBash,
        ANDROID_WINDOWS_WORKDIR: 'C:\\dev\\foliole-test',
        POWERSHELL_ARGS_LOG: bashPath(powershellArgsLog)
      });

      expect(result.code).toBe(0);
      expect(result.stdout).toContain(`sync-target:${mirrorDirForBash}`);
      const args = (await readFile(powershellArgsLog, 'utf8')).split('\n').filter(Boolean);
      expect(args).toContain('-WindowsWorkDir');
      expect(args).toContain('C:\\dev\\foliole-test');
      expect(args).toContain('-TaskName');
      expect(args).toContain('lint');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('refuses device instrumentation tests unless explicitly allowed', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'android-gradle-check-'));
    try {
      const result = await runGradleCheck(tempRoot, ['connectedDebugAndroidTest'], {
        ANDROID_SKIP_WINDOWS_SYNC: '1'
      });

      expect(result.code).toBe(2);
      expect(result.stderr).toContain('connectedDebugAndroidTest can delete the active Android app database');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('allows device instrumentation tests with the destructive-test confirmation', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'android-gradle-check-'));
    try {
      const mockBinDir = path.join(tempRoot, 'bin');
      const powershellArgsLog = path.join(tempRoot, 'powershell-args.log');
      await mkdir(mockBinDir, { recursive: true });
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

      const result = await runGradleCheck(tempRoot, ['connectedDebugAndroidTest'], {
        ANDROID_SKIP_WINDOWS_SYNC: '1',
        ANDROID_WINDOWS_WORKDIR: 'C:\\dev\\foliole-test',
        FOLIOLE_ANDROID_ALLOW_DATA_DESTRUCTIVE_TEST: '1',
        PATH: `${bashPath(mockBinDir)}:/usr/bin:/bin:${process.env.PATH ?? ''}`,
        POWERSHELL_ARGS_LOG: bashPath(powershellArgsLog),
        WINDOWS_SCRIPT_PATH: path.join(tempRoot, 'windows-gradle-check.ps1')
      });

      expect(result.code).toBe(0);
      const args = (await readFile(powershellArgsLog, 'utf8')).split('\n').filter(Boolean);
      expect(args).toContain('connectedDebugAndroidTest');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('forwards targeted instrumentation filters to Gradle', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'android-gradle-check-'));
    try {
      const mockBinDir = path.join(tempRoot, 'bin');
      const powershellArgsLog = path.join(tempRoot, 'powershell-args.log');
      await mkdir(mockBinDir, { recursive: true });
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

      const result = await runGradleCheck(
        tempRoot,
        ['connectedDebugAndroidTest', '--class', 'FolioleCompanionSyncPackContractApplyTest'],
        {
          ANDROID_SKIP_WINDOWS_SYNC: '1',
          FOLIOLE_ANDROID_ALLOW_DATA_DESTRUCTIVE_TEST: '1',
          PATH: `${bashPath(mockBinDir)}:/usr/bin:/bin:${process.env.PATH ?? ''}`,
          POWERSHELL_ARGS_LOG: bashPath(powershellArgsLog),
          WINDOWS_SCRIPT_PATH: path.join(tempRoot, 'windows-gradle-check.ps1')
        }
      );

      expect(result.code).toBe(0);
      const args = (await readFile(powershellArgsLog, 'utf8')).split('\n').filter(Boolean);
      expect(args).toContain('-GradleArguments');
      expect(args).toContain('-Pandroid.testInstrumentationRunnerArguments.class=com.foliole.android.FolioleCompanionSyncPackContractApplyTest');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });
});
