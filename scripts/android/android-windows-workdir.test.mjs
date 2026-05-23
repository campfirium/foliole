// @vitest-environment node
/* global process */

import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const WORKDIR_SCRIPT = path.join(REPO_ROOT, 'scripts', 'android', 'android-windows-workdir.sh');

function runWorkdirProbe(cwd, env = {}) {
  return new Promise((resolve) => {
    const probe = [
      `source "${WORKDIR_SCRIPT}"`,
      'echo "mirror=${ANDROID_WINDOWS_MIRROR_DIR}"',
      'android_shell_path_to_windows_path "/d/C/foliole/scripts/android/windows-open.ps1"'
    ].join('\n');
    const child = spawn('bash', ['-c', probe], {
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

describe('android-windows-workdir.sh', () => {
  it('does not require wslpath in the Windows-native bash environment', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'android-workdir-native-'));
    try {
      const binDir = path.join(tempRoot, 'bin');
      await mkdir(binDir);
      const result = await runWorkdirProbe(tempRoot, {
        PATH: `${binDir}${path.delimiter}${process.env.PATH ?? ''}`,
        ANDROID_WINDOWS_WORKDIR: 'D:\\C\\foliole-android-preview'
      });

      expect(result.code).toBe(0);
      expect(result.stderr).toBe('');
      expect(result.stdout).toContain('mirror=/d/C/foliole-android-preview');
      expect(result.stdout).toContain('D:\\C\\foliole\\scripts\\android\\windows-open.ps1');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('still uses wslpath when WSL provides it', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'android-workdir-wsl-'));
    try {
      const binDir = path.join(tempRoot, 'bin');
      await mkdir(binDir);
      await writeFile(
        path.join(binDir, 'wslpath'),
        [
          '#!/usr/bin/env bash',
          'set -euo pipefail',
          'if [[ "$1" == "-u" ]]; then echo "/mnt/d/C/foliole-android-preview"; exit 0; fi',
          'if [[ "$1" == "-w" ]]; then echo "WIN:$2"; exit 0; fi'
        ].join('\n'),
        { encoding: 'utf8', mode: 0o755 }
      );

      const result = await runWorkdirProbe(tempRoot, {
        PATH: `${binDir}${path.delimiter}${process.env.PATH ?? ''}`,
        ANDROID_WINDOWS_WORKDIR: 'D:\\C\\foliole-android-preview'
      });

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('mirror=/mnt/d/C/foliole-android-preview');
      expect(result.stdout).toContain('WIN:/d/C/foliole/scripts/android/windows-open.ps1');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });
});
