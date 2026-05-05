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
      await writeFile(
        path.join(mockBinDir, 'wslpath'),
        ['#!/usr/bin/env bash', 'set -euo pipefail', 'if [[ "$1" == "-w" ]]; then echo "WIN:$2"; else echo "$2"; fi'].join('\n'),
        { encoding: 'utf8', mode: 0o755 }
      );
      await chmod(path.join(mockBinDir, 'powershell.exe'), 0o755);
      await chmod(path.join(mockBinDir, 'wslpath'), 0o755);

      const outputDir = path.join(tempRoot, 'shots');
      const result = await runScreenshot(tempRoot, [outputDir], {
        PATH: `${mockBinDir}:${process.env.PATH ?? ''}`,
        WINDOWS_SCRIPT_PATH: path.join(tempRoot, 'windows-screenshot.ps1'),
        POWERSHELL_ARGS_LOG: powershellArgsLog
      });

      expect(result.code).toBe(0);
      const args = (await readFile(powershellArgsLog, 'utf8')).split('\n').filter(Boolean);
      expect(args).toContain('-File');
      expect(args).toContain(`WIN:${path.join(tempRoot, 'windows-screenshot.ps1')}`);
      expect(args).toContain('-OutputDir');
      expect(args).toContain(`WIN:${outputDir}`);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });
});
