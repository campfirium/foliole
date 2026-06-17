// @vitest-environment node
/* global process */

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ANDROID_PREVIEW_SCRIPT = path.join(REPO_ROOT, 'scripts', 'android', 'android-preview.sh');

function runAndroidPreview(cwd, env = {}) {
  return new Promise((resolve) => {
    const child = spawn('bash', [ANDROID_PREVIEW_SCRIPT], {
      cwd,
      env: {
        ...process.env,
        ANDROID_DATA_PROTECTION: '0',
        ANDROID_PREVIEW_SYNC_STATE_CHECK: '0',
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

async function writePassthroughSqliteRunner(rootDir) {
  return writeExecutable(rootDir, 'electron-sqlite-runner.mjs', [
    '#!/usr/bin/env node',
    'import { spawnSync } from "node:child_process";',
    'const [script, ...args] = process.argv.slice(2);',
    'const result = spawnSync(process.execPath, [script, ...args], { stdio: "inherit" });',
    'process.exit(result.status ?? 1);'
  ].join('\n'));
}

describe('android-preview failure and protection paths', () => {
  it('backs up app data before deploy and checks it after deploy', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'android-preview-data-'));
    try {
      const sourceSync = await writeExecutable(tempRoot, 'source-sync.sh', '#!/usr/bin/env bash\necho source-sync-ok\n');
      const androidSync = await writeExecutable(tempRoot, 'android-sync.sh', '#!/usr/bin/env bash\necho cap-sync-ok\n');
      const emulator = await writeExecutable(tempRoot, 'emulator.sh', '#!/usr/bin/env bash\necho emulator-ok\n');
      const deploy = await writeExecutable(tempRoot, 'deploy.sh', '#!/usr/bin/env bash\necho deploy-ok\n');
      const sqliteRunner = await writePassthroughSqliteRunner(tempRoot);
      const dataProtection = await writeExecutable(
        tempRoot,
        'data-protection.mjs',
        'console.log(`data-protection:${process.argv.slice(2).join("|")}`);\n'
      );

      const result = await runAndroidPreview(tempRoot, {
        ANDROID_DATA_PROTECTION: '1',
        ANDROID_DATA_PROTECTION_SCRIPT: dataProtection,
        ELECTRON_SQLITE_RUNNER: sqliteRunner,
        ANDROID_DATA_PROTECTION_BACKUP_DIR: path.join(tempRoot, 'backups'),
        ANDROID_SOURCE_SYNC_SCRIPT: sourceSync,
        ANDROID_SYNC_SCRIPT: androidSync,
        ANDROID_EMULATOR_SCRIPT: emulator,
        ANDROID_DEPLOY_SCRIPT: deploy,
        ANDROID_PREVIEW_AVD: 'Test_AVD',
        ANDROID_WINDOWS_MIRROR_DIR: path.join(tempRoot, 'android-preview-mirror')
      });

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('[android-preview] begin: android-data-backup');
      expect(result.stdout).toContain('[android-preview] begin: android-data-check');
      expect(result.stdout).toContain('data-protection:--mode|backup');
      expect(result.stdout).toContain('data-protection:--mode|check');
      expect(result.stdout.indexOf('data-protection:--mode|backup')).toBeLessThan(result.stdout.indexOf('deploy-ok'));
      expect(result.stdout.indexOf('deploy-ok')).toBeLessThan(result.stdout.indexOf('data-protection:--mode|check'));
      expect(result.stdout).toContain('[android-preview] status: OPENED');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }, 15000);

  it('fails preview as a data protection failure when the post-deploy check fails', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'android-preview-data-fail-'));
    try {
      const sourceSync = await writeExecutable(tempRoot, 'source-sync.sh', '#!/usr/bin/env bash\necho source-sync-ok\n');
      const androidSync = await writeExecutable(tempRoot, 'android-sync.sh', '#!/usr/bin/env bash\necho cap-sync-ok\n');
      const emulator = await writeExecutable(tempRoot, 'emulator.sh', '#!/usr/bin/env bash\necho emulator-ok\n');
      const deploy = await writeExecutable(tempRoot, 'deploy.sh', '#!/usr/bin/env bash\necho deploy-ok\n');
      const sqliteRunner = await writePassthroughSqliteRunner(tempRoot);
      const dataProtection = await writeExecutable(
        tempRoot,
        'data-protection.mjs',
        [
          'const args = process.argv.slice(2);',
          'console.log(`data-protection:${args.join("|")}`);',
          'if (args.includes("check")) process.exit(2);'
        ].join('\n')
      );

      const result = await runAndroidPreview(tempRoot, {
        ANDROID_DATA_PROTECTION: '1',
        ANDROID_DATA_PROTECTION_SCRIPT: dataProtection,
        ELECTRON_SQLITE_RUNNER: sqliteRunner,
        ANDROID_DATA_PROTECTION_BACKUP_DIR: path.join(tempRoot, 'backups'),
        ANDROID_SOURCE_SYNC_SCRIPT: sourceSync,
        ANDROID_SYNC_SCRIPT: androidSync,
        ANDROID_EMULATOR_SCRIPT: emulator,
        ANDROID_DEPLOY_SCRIPT: deploy,
        ANDROID_PREVIEW_AVD: 'Test_AVD',
        ANDROID_WINDOWS_MIRROR_DIR: path.join(tempRoot, 'android-preview-mirror')
      });

      expect(result.code).toBe(1);
      expect(result.stdout).toContain('deploy-ok');
      expect(result.stdout).toContain('[android-preview] failed at: data protection check');
      expect(result.stdout).toContain('[android-preview] status: FAILED');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }, 15000);

  it('fails with a clear emulator stage when startup hangs past the timeout', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'android-preview-timeout-'));
    try {
      const sourceSync = await writeExecutable(tempRoot, 'source-sync.sh', '#!/usr/bin/env bash\necho source-sync-before-timeout\n');
      const androidSync = await writeExecutable(tempRoot, 'android-sync.sh', '#!/usr/bin/env bash\necho cap-sync-before-timeout\n');
      const emulator = await writeExecutable(tempRoot, 'emulator.sh', '#!/usr/bin/env bash\nsleep 2\n');
      const failIfCalled = await writeExecutable(tempRoot, 'fail-if-called.sh', '#!/usr/bin/env bash\necho should-not-run\nexit 64\n');

      const result = await runAndroidPreview(tempRoot, {
        ANDROID_SOURCE_SYNC_SCRIPT: sourceSync,
        ANDROID_SYNC_SCRIPT: androidSync,
        ANDROID_EMULATOR_SCRIPT: emulator,
        ANDROID_DEPLOY_SCRIPT: failIfCalled,
        ANDROID_PREVIEW_AVD: 'Slow_AVD',
        ANDROID_PREVIEW_EMULATOR_TIMEOUT_SECONDS: '1',
        ANDROID_WINDOWS_MIRROR_DIR: path.join(tempRoot, 'android-preview-mirror')
      });

      expect(result.code).toBe(1);
      expect(result.stdout).toContain('source-sync-before-timeout');
      expect(result.stdout).toContain('cap-sync-before-timeout');
      expect(result.stdout).toContain('[android-preview] android-emulator timeout: 1s');
      expect(result.stdout).toContain('[android-preview] failed at: emulator startup');
      expect(result.stdout).toContain('[android-preview] status: FAILED');
      expect(result.stdout).not.toContain('should-not-run');
      expect(result.stdout).not.toContain('[android-preview] begin: android-deploy');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }, 15000);

  it('uses a kill-after timeout for hung preview subprocesses', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'android-preview-kill-after-'));
    const mockBinRelative = `.tmp/android-preview-timeout-bin-${Date.now()}`;
    const mockBinDir = path.join(REPO_ROOT, mockBinRelative);
    try {
      await mkdir(mockBinDir);
      await writeExecutable(REPO_ROOT, `${mockBinRelative}/timeout`, [
        '#!/usr/bin/env bash',
        'echo timeout-args:$*',
        'exit 124'
      ].join('\n'));
      const failIfCalled = await writeExecutable(tempRoot, 'fail-if-called.sh', '#!/usr/bin/env bash\necho should-not-run\nexit 64\n');

      const result = await runAndroidPreview(tempRoot, {
        PATH: `${mockBinRelative}:${process.env.PATH}`,
        ANDROID_PREVIEW_TIMEOUT_COMMAND: `${mockBinRelative}/timeout`,
        ANDROID_SOURCE_SYNC_SCRIPT: failIfCalled,
        ANDROID_SYNC_SCRIPT: failIfCalled,
        ANDROID_EMULATOR_SCRIPT: failIfCalled,
        ANDROID_DEPLOY_SCRIPT: failIfCalled,
        ANDROID_PREVIEW_AVD: 'Test_AVD',
        ANDROID_PREVIEW_KILL_AFTER_SECONDS: '3',
        ANDROID_WINDOWS_MIRROR_DIR: path.join(tempRoot, 'android-preview-mirror')
      });

      expect(result.code).toBe(1);
      expect(result.stdout).toContain('timeout-args:--kill-after=3 600');
      expect(result.stdout).toContain('[android-preview] failed at: windows sync');
    } finally {
      await rm(mockBinDir, { recursive: true, force: true });
      await rm(tempRoot, { recursive: true, force: true });
    }
  }, 15000);
});
