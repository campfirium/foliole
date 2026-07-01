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

function toBashPath(filePath) {
  return filePath.replace(/^([A-Za-z]):[\\/]/u, (_, drive) => `/${drive.toLowerCase()}/`).replaceAll('\\', '/');
}

function runScript(env) {
  return new Promise((resolve) => {
    const child = spawn('bash', [SYNC_SCRIPT], {
      cwd: REPO_ROOT,
      env: {
        ...process.env,
        WINDOWS_SYNC_LOCK_FILE: path.join(os.tmpdir(), `foliole-windows-sync-test-${process.pid}.lock`),
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
      await mkdir(path.join(mirrorDir, 'trees'), { recursive: true });
      await writeFile(path.join(mirrorDir, 'trees', 'stale.txt'), 'stale worktree copy', 'utf8');
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
      expect(args).toContain('.claude/');
      expect(args).toContain('.windows-native-boot-ready.json');
      expect(args).toContain('.windows-native-bridge-ready.json');
      expect(args).toContain('.windows-native-window-visible.json');
      expect(args).toContain('.windows-native-client-state.json');
      expect(args).toContain('.windows-dev-restart-intent.json');
      expect(args).toContain('.windows-dev-restart-delivered.json');
      expect(args).toContain('.windows-dev-renderer-reload-intent.json');
      expect(args).toContain('.windows-dev-renderer-reload-delivered.json');
      expect(args).toContain('.windows-dev-shell-restart-request.json');
      expect(args).toContain('trees/');
      expect(args).toContain('--inplace');
      expect(args).not.toContain('--itemize-changes');
      expect(args).toContain('android/app/src/main/assets/public/');
      expect(args).toContain('android/app/src/main/assets/capacitor.config.json');
      expect(args).toContain('android/app/src/main/assets/capacitor.plugins.json');
      expect(args).toContain('android/app/src/main/res/xml/config.xml');
      expect(args).toContain('android/app/capacitor.build.gradle');
      expect(args).toContain('android/capacitor.settings.gradle');
      expect(args).toContain('android/capacitor-cordova-android-plugins/');
      await expect(readFile(path.join(mirrorDir, 'trees', 'stale.txt'), 'utf8')).rejects.toThrow();
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('preserves generated Capacitor Android files even when the legacy opt-in is unset', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'windows-sync-android-generated-'));
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
          'printf "%s\n" "$@" > "${RSYNC_ARGS_LOG}"'
        ].join('\n'),
        'utf8'
      );
      await chmod(mockRsync, 0o755);

      const result = await runScript({
        PATH: `${mockBinDir}:${process.env.PATH ?? ''}`,
        RSYNC_ARGS_LOG: argsLog,
        WINDOWS_MIRROR_DIR: mirrorDir,
        WINDOWS_SYNC_PRESERVE_ANDROID_GENERATED: '0'
      });

      expect(result.code).toBe(0);
      const args = (await readFile(argsLog, 'utf8'))
        .split('\n')
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0);

      expect(args).toContain('android/app/src/main/assets/public/');
      expect(args).toContain('android/app/src/main/assets/capacitor.config.json');
      expect(args).toContain('android/app/capacitor.build.gradle');
      expect(args).toContain('android/capacitor.settings.gradle');
      expect(args).toContain('android/capacitor-cordova-android-plugins/');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('only prints rsync item changes when verbose output or a change log is requested', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'windows-sync-verbose-'));
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
        WINDOWS_MIRROR_DIR: mirrorDir,
        WINDOWS_SYNC_VERBOSE: '1'
      });

      expect(result.code).toBe(0);
      const args = (await readFile(argsLog, 'utf8'))
        .split('\n')
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0);

      expect(args).toContain('--itemize-changes');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('uses changed-files sync when a stamp and changed file list are available', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'windows-sync-fast-'));
    const stampFile = path.join(REPO_ROOT, '.tmp', `windows-sync-test-${process.pid}-${Date.now()}.stamp`);
    try {
      const mirrorDir = path.join(tempRoot, 'mirror');
      const mockBinDir = path.join(tempRoot, 'bin');
      const argsLog = path.join(tempRoot, 'rsync-args.log');
      const filesFromLog = path.join(tempRoot, 'files-from.log');
      const mockRsync = path.join(mockBinDir, 'rsync');
      await mkdir(mirrorDir, { recursive: true });
      await mkdir(mockBinDir, { recursive: true });
      await mkdir(path.dirname(stampFile), { recursive: true });
      await writeFile(stampFile, '', 'utf8');
      await writeFile(
        mockRsync,
        [
          '#!/usr/bin/env bash',
          'set -euo pipefail',
          'printf "%s\\n" "$@" > "${RSYNC_ARGS_LOG}"',
          'for arg in "$@"; do',
          '  if [[ "$arg" == --files-from=* ]]; then',
          '    cat "${arg#--files-from=}" > "${FILES_FROM_LOG}"',
          '  fi',
          'done'
        ].join('\n'),
        'utf8'
      );
      await chmod(mockRsync, 0o755);

      const result = await runScript({
        FILES_FROM_LOG: filesFromLog,
        PATH: `${mockBinDir}:${process.env.PATH ?? ''}`,
        RSYNC_ARGS_LOG: argsLog,
        WINDOWS_MIRROR_DIR: mirrorDir,
        WINDOWS_SYNC_CHANGED_FILES: ['package.json', 'missing.txt'].join('\n'),
        WINDOWS_SYNC_STAMP_FILE: toBashPath(stampFile)
      });

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('status: SYNCED mode=changed-files files=1');
      expect(await readFile(filesFromLog, 'utf8')).toBe('package.json\n');
      const args = await readFile(argsLog, 'utf8');
      expect(args).toContain(`--files-from=`);
      expect(args).not.toContain('--delete');
    } finally {
      await rm(stampFile, { force: true });
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

});
