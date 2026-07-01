// @vitest-environment node
/* global process */

import { chmod, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCRIPT = path.join(REPO_ROOT, 'scripts', 'windows', 'windows-desktop-test.sh');

function runScript(env, args = []) {
  return new Promise((resolve) => {
    const child = spawn('bash', [SCRIPT, ...args], {
      cwd: REPO_ROOT,
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
      resolve({ code, stdout, stderr });
    });
  });
}

describe('windows desktop test script', () => {
  it('forwards config and extra playwright args to the windows runner', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'windows-desktop-test-'));
    try {
      const mockBinDir = path.join(tempRoot, 'bin');
      const callsLog = path.join(tempRoot, 'calls.log');
      const mockPowerShell = path.join(mockBinDir, 'powershell.exe');
      const mockWslpath = path.join(mockBinDir, 'wslpath');
      await mkdir(mockBinDir, { recursive: true });
      await writeFile(
        mockPowerShell,
        [
          '#!/usr/bin/env bash',
          'set -euo pipefail',
          'printf "%s\\n" "$@" > "${CALLS_LOG}"'
        ].join('\n'),
        'utf8'
      );
      await chmod(mockPowerShell, 0o755);
      await writeFile(
        mockWslpath,
        [
          '#!/usr/bin/env bash',
          'set -euo pipefail',
          'printf "%s\\n" "$2"'
        ].join('\n'),
        'utf8'
      );
      await chmod(mockWslpath, 0o755);

      const result = await runScript(
        {
          CALLS_LOG: callsLog,
          PATH: `${mockBinDir}:${process.env.PATH ?? ''}`,
          WINDOWS_DESKTOP_TEST_CONFIG: 'playwright.desktop.config.ts',
          WINDOWS_DESKTOP_TEST_POWERSHELL_BIN: mockPowerShell,
          WINDOWS_DESKTOP_TEST_SKIP_BUILD: '1',
          WINDOWS_DESKTOP_TEST_SKIP_SYNC: '1'
        },
        ['tests/desktop/smoke.spec.ts', '--grep', 'startup']
      );

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('config=playwright.desktop.config.ts');
      const args = (await readFile(callsLog, 'utf8'))
        .split('\n')
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0);
      expect(args).toContain('-File');
      expect(args).toContain('-WindowsWorkDir');
      expect(args).toContain('D:\\C\\foliole');
      expect(args).toContain('-Config');
      expect(args).toContain('playwright.desktop.config.ts');
      expect(args).toContain('tests/desktop/smoke.spec.ts');
      expect(args).toContain('--grep');
      expect(args).toContain('startup');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });
});
