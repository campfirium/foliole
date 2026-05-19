// @vitest-environment node
/* global process */

import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function runNodeModulesCheck(env) {
  return new Promise((resolve) => {
    const child = spawn(
      'bash',
      [
        '-c',
        [
          'set -euo pipefail',
          'source scripts/windows/windows-preview-common.sh',
          'source scripts/windows/windows-preview-client.sh',
          'verify_windows_node_modules',
          'verify_windows_native_abi'
        ].join('\n')
      ],
      {
        cwd: REPO_ROOT,
        env: { ...process.env, ...env }
      }
    );
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

describe('windows preview node_modules check', () => {
  it('uses Windows npm.cmd with a PATHEXT that can resolve node.exe', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'windows-preview-node-modules-'));
    try {
      const fakePowerShell = path.join(tempRoot, 'powershell.exe');
      const commandLog = path.join(tempRoot, 'powershell-command.log');
      await writeFile(
        fakePowerShell,
        [
          '#!/usr/bin/env bash',
          'set -euo pipefail',
          'printf "%s\\n" "$*" > "$COMMAND_LOG"',
          'case "$*" in',
          '  *"PATHEXT=\'.COM;.EXE;.BAT;.CMD;.PS1\'"*"npm.cmd ls --depth=0 --json --silent"*) exit 0 ;;',
          '  *) echo "unexpected powershell command: $*" >&2; exit 7 ;;',
          'esac'
        ].join('\n'),
        'utf8'
      );
      await chmod(fakePowerShell, 0o755);

      const result = await runNodeModulesCheck({
        COMMAND_LOG: commandLog,
        PATH: `${tempRoot}:${process.env.PATH}`,
        WINDOWS_NATIVE_ABI_CHECK_COMMAND: 'true',
        WINDOWS_NODE_MODULES_CHECK_COMMAND: '',
        WINDOWS_WORKDIR: 'C:\\dev\\foliole'
      });

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('windows node_modules check passed');
      expect(result.stdout).toContain('windows native ABI preflight passed');
      const command = await readFile(commandLog, 'utf8');
      expect(command).toContain("PATHEXT='.COM;.EXE;.BAT;.CMD;.PS1'");
      expect(command).toContain('npm.cmd ls --depth=0 --json --silent');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('does not suggest a plain npm install when dependency completeness fails', async () => {
    const result = await runNodeModulesCheck({
      WINDOWS_NATIVE_ABI_CHECK_COMMAND: 'true',
      WINDOWS_NODE_MODULES_CHECK_COMMAND: 'echo missing dependency; exit 7',
      WINDOWS_WORKDIR: 'C:\\dev\\foliole'
    });

    expect(result.code).toBe(1);
    expect(result.stdout).toContain('windows node_modules check failed');
    expect(result.stdout).not.toContain('run npm install in C:\\dev\\foliole');
    expect(result.stdout).toContain('restore Electron native ABI before preview');
    expect(result.stdout).toContain('do not run plain Node npm rebuild for better-sqlite3');
  });

  it('stops before later preview actions when native ABI preflight fails', async () => {
    const result = await runNodeModulesCheck({
      WINDOWS_NATIVE_ABI_CHECK_COMMAND: 'echo ABI mismatch; exit 9',
      WINDOWS_NODE_MODULES_CHECK_COMMAND: 'true',
      WINDOWS_WORKDIR: 'C:\\dev\\foliole'
    });

    expect(result.code).toBe(1);
    expect(result.stdout).toContain('windows node_modules check passed');
    expect(result.stdout).toContain('windows native ABI preflight failed');
    expect(result.stdout).toContain('restore better-sqlite3 for the Electron ABI');
    expect(result.stdout).toContain('ABI mismatch');
  });
});
