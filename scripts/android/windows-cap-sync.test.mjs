// @vitest-environment node
/* global process */

import { chmod, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CAP_SYNC_SCRIPT = path.join(REPO_ROOT, 'scripts', 'android', 'windows-cap-sync.sh');

function runCapSync(cwd, env = {}) {
  return new Promise((resolve) => {
    const child = spawn('bash', [CAP_SYNC_SCRIPT], {
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

async function writeExecutable(rootDir, relativePath, content) {
  const fullPath = path.join(rootDir, relativePath);
  await writeFile(fullPath, content, { encoding: 'utf8', mode: 0o755 });
  return fullPath;
}

describe('windows-cap-sync.sh', () => {
  it('passes dependency refresh mode to the Windows PowerShell sync script', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'android-cap-sync-'));
    try {
      const mockBinDir = path.join(tempRoot, 'bin');
      const powershellArgsLog = path.join(tempRoot, 'powershell-args.log');
      await mkdir(mockBinDir, { recursive: true });
      const windowsSync = await writeExecutable(tempRoot, 'windows-sync.sh', '#!/usr/bin/env bash\necho cap-sync-target:${WINDOWS_MIRROR_DIR}\n');
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
      const result = await runCapSync(tempRoot, {
        PATH: `${mockBinDir}:${process.env.PATH ?? ''}`,
        WINDOWS_SYNC_SCRIPT: windowsSync,
        WINDOWS_SCRIPT_PATH: path.join(tempRoot, 'windows-cap-sync.ps1'),
        ANDROID_WINDOWS_MIRROR_DIR: mirrorDir,
        ANDROID_WINDOWS_WORKDIR: 'C:\\dev\\foliole-test',
        ANDROID_WINDOWS_DEPENDENCY_REFRESH: 'skip',
        POWERSHELL_ARGS_LOG: powershellArgsLog
      });

      expect(result.code).toBe(0);
      expect(result.stdout).toContain(`cap-sync-target:${mirrorDir}`);
      const args = (await readFile(powershellArgsLog, 'utf8')).split('\n').filter(Boolean);
      expect(args).toContain('-DependencyRefresh');
      expect(args).toContain('skip');
      expect(args).toContain('-WindowsWorkDir');
      expect(args).toContain('C:\\dev\\foliole-test');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });
});
