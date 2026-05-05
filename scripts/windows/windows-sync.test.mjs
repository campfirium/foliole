// @vitest-environment node
/* global process */

import { chmod, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SYNC_SCRIPT = path.join(REPO_ROOT, 'scripts', 'windows', 'windows-sync.sh');

function runScript(env) {
  return new Promise((resolve) => {
    const child = spawn('bash', [SYNC_SCRIPT], {
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

describe('windows-sync script', () => {
  it('excludes local temp artifacts from the windows mirror sync', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'windows-sync-test-'));
    try {
      const mirrorDir = path.join(tempRoot, 'mirror');
      const mockBinDir = path.join(tempRoot, 'bin');
      const argsLog = path.join(tempRoot, 'rsync-args.log');
      const mockRsync = path.join(mockBinDir, 'rsync');

      await mkdir(mirrorDir, { recursive: true });
      await mkdir(mockBinDir, { recursive: true });
      await writeFile(
        mockRsync,
        [
          '#!/usr/bin/env bash',
          'set -euo pipefail',
          'printf "%s\\n" "$@" > "${RSYNC_ARGS_LOG}"'
        ].join('\n'),
        'utf8'
      );
      await chmod(mockRsync, 0o755);

      const result = await runScript({
        PATH: `${mockBinDir}:${process.env.PATH ?? ''}`,
        RSYNC_ARGS_LOG: argsLog,
        WINDOWS_MIRROR_DIR: mirrorDir
      });

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('status: SYNCED');

      const args = (await readFile(argsLog, 'utf8'))
        .split('\n')
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0);

      expect(args).toContain('.tmp/');
      expect(args).toContain('.tmp-*/');
      expect(args).toContain('.tmp-vitest/');
      expect(args).toContain('.tmp-vitest-*/');
      expect(args).toContain('.tmp-npm/');
      expect(args).toContain('.windows-native-boot-ready.json');
      expect(args).toContain('.windows-native-bridge-ready.json');
      expect(args).toContain('--inplace');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });
});
