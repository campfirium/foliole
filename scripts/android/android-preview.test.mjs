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
const ANDROID_PREVIEW_LITE_SCRIPT = path.join(REPO_ROOT, 'scripts', 'android', 'android-preview-lite.sh');

function runAndroidPreview(cwd, env = {}, script = ANDROID_PREVIEW_SCRIPT) {
  return new Promise((resolve) => {
    const child = spawn('bash', [script], {
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

describe('android-preview.sh', () => {
  it('defaults to the dedicated Android workspace instead of the desktop mirror', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'android-preview-workdir-'));
    try {
      const mockBinDir = path.join(tempRoot, 'bin');
      await mkdir(mockBinDir);
      await writeExecutable(tempRoot, 'bin/wslpath', [
        '#!/usr/bin/env bash',
        'set -euo pipefail',
        'if [[ "$1" == "-u" && "$2" == *"foliole-android-preview"* ]]; then',
        '  echo "/mnt/c/dev/foliole-android-preview"',
        '  exit 0',
        'fi',
        'if [[ "$1" == "-u" && "$2" == *"foliole"* ]]; then',
        '  echo "/mnt/c/dev/foliole"',
        '  exit 0',
        'fi',
        'echo "$2"'
      ].join('\n'));
      const windowsSync = await writeExecutable(tempRoot, 'windows-sync.sh', [
        '#!/usr/bin/env bash',
        'echo sync-target:${WINDOWS_MIRROR_DIR}',
        'echo sync-changed:${WINDOWS_SYNC_CHANGED_FILES}',
        'echo sync-stamp:${WINDOWS_SYNC_STAMP_FILE}',
        'if [[ "${WINDOWS_MIRROR_DIR}" == "/mnt/c/dev/foliole" ]]; then exit 66; fi'
      ].join('\n'));
      const mtimeChanges = await writeExecutable(tempRoot, 'mtime-changes.sh', [
        '#!/usr/bin/env bash',
        'resolve_changed_files() {',
        '  echo package.json',
        '}'
      ].join('\n'));
      const androidSync = await writeExecutable(tempRoot, 'android-sync.sh', '#!/usr/bin/env bash\necho android-workdir:${ANDROID_WINDOWS_WORKDIR}\n');
      const failIfCalled = await writeExecutable(tempRoot, 'fail-if-called.sh', '#!/usr/bin/env bash\nexit 64\n');

      const result = await runAndroidPreview(tempRoot, {
        PATH: `${mockBinDir}${path.delimiter}${process.env.PATH}`,
        WINDOWS_SYNC_SCRIPT: windowsSync,
        WINDOWS_MTIME_CHANGES_SCRIPT: mtimeChanges,
        ANDROID_SYNC_SCRIPT: androidSync,
        ANDROID_EMULATOR_SCRIPT: failIfCalled,
        ANDROID_DEPLOY_SCRIPT: failIfCalled,
        ANDROID_OPEN_SCRIPT: failIfCalled,
        ANDROID_PREVIEW_AVD: '',
        ANDROID_PREVIEW_OPEN_STUDIO: '0',
        ANDROID_PREVIEW_SYNC_STAMP_FILE: path.join(tempRoot, 'android-preview-sync.stamp')
      });

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('sync-target:/mnt/c/dev/foliole-android-preview');
      expect(result.stdout).toContain('sync-changed:package.json');
      expect(result.stdout).toContain(`sync-stamp:${path.join(tempRoot, 'android-preview-sync.stamp')}`);
      expect(result.stdout).toContain('android-workdir:C:\\dev\\foliole-android-preview');
      expect(result.stdout).not.toContain('sync-target:/mnt/c/dev/foliole\n');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }, 15000);

  it('prints step boundaries and deploy timeout details', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'android-preview-'));
    try {
      const windowsSync = await writeExecutable(tempRoot, 'windows-sync.sh', '#!/usr/bin/env bash\necho sync-target:${WINDOWS_MIRROR_DIR}\necho preserve-android-generated:${WINDOWS_SYNC_PRESERVE_ANDROID_GENERATED-unset}\n');
      const androidSync = await writeExecutable(tempRoot, 'android-sync.sh', '#!/usr/bin/env bash\necho android-workdir:${ANDROID_WINDOWS_WORKDIR}\n');
      const emulator = await writeExecutable(tempRoot, 'emulator.sh', '#!/usr/bin/env bash\necho emulator-ready\n');
      const deploy = await writeExecutable(tempRoot, 'deploy.sh', '#!/usr/bin/env bash\necho deploy-workdir:${ANDROID_WINDOWS_WORKDIR}\necho preview-deploy:${FOLIOLE_ANDROID_PREVIEW_DEPLOY-unset}\n');

      const result = await runAndroidPreview(tempRoot, {
        WINDOWS_SYNC_SCRIPT: windowsSync,
        ANDROID_SYNC_SCRIPT: androidSync,
        ANDROID_EMULATOR_SCRIPT: emulator,
        ANDROID_DEPLOY_SCRIPT: deploy,
        ANDROID_PREVIEW_AVD: 'Test_AVD',
        ANDROID_PREVIEW_DEPLOY_TIMEOUT_SECONDS: '123',
        ANDROID_WINDOWS_MIRROR_DIR: path.join(tempRoot, 'android-preview-mirror'),
        ANDROID_WINDOWS_WORKDIR: 'C:\\dev\\foliole-test'
      });

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('[android-preview] begin: windows-sync');
      expect(result.stdout).toContain('[android-preview] windows-sync timeout: 600s');
      expect(result.stdout).toMatch(/sync-target:.*android-preview-mirror/u);
      expect(result.stdout).toContain('preserve-android-generated:unset');
      expect(result.stdout).toContain('android-workdir:C:\\dev\\foliole-test');
      expect(result.stdout).toContain('deploy-workdir:C:\\dev\\foliole-test');
      expect(result.stdout).toContain('preview-deploy:1');
      expect(result.stdout).toContain('[android-preview] done: windows-sync');
      expect(result.stdout).toContain('[android-preview] android-cap-sync timeout: 600s');
      expect(result.stdout).toContain('[android-preview] begin: android-cap-sync');
      expect(result.stdout).toContain('[android-preview] done: android-cap-sync');
      expect(result.stdout).toContain('[android-preview] android-emulator timeout: 240s');
      expect(result.stdout).toContain('[android-preview] begin: android-emulator');
      expect(result.stdout).toContain('[android-preview] done: android-emulator');
      expect(result.stdout).toContain('[android-preview] android-deploy timeout: 123s');
      expect(result.stdout).toContain('[android-preview] begin: android-deploy');
      expect(result.stdout).toContain('[android-preview] done: android-deploy');
      expect(result.stdout).toContain('[android-preview] status: OPENED');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }, 15000);

  it('allows sync-only preview when the AVD and Studio launch are disabled', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'android-preview-'));
    try {
      const windowsSync = await writeExecutable(tempRoot, 'windows-sync.sh', '#!/usr/bin/env bash\necho sync-only-target:${WINDOWS_MIRROR_DIR}\n');
      const androidSync = await writeExecutable(tempRoot, 'android-sync.sh', '#!/usr/bin/env bash\necho android-sync-only\n');
      const failIfCalled = await writeExecutable(tempRoot, 'fail-if-called.sh', '#!/usr/bin/env bash\nexit 64\n');

      const result = await runAndroidPreview(tempRoot, {
        WINDOWS_SYNC_SCRIPT: windowsSync,
        ANDROID_SYNC_SCRIPT: androidSync,
        ANDROID_EMULATOR_SCRIPT: failIfCalled,
        ANDROID_DEPLOY_SCRIPT: failIfCalled,
        ANDROID_OPEN_SCRIPT: failIfCalled,
        ANDROID_PREVIEW_AVD: '',
        ANDROID_PREVIEW_OPEN_STUDIO: '0',
        ANDROID_WINDOWS_MIRROR_DIR: path.join(tempRoot, 'android-preview-mirror')
      });

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('sync-only-target:');
      expect(result.stdout).toContain('android-sync-only');
      expect(result.stdout).toContain('[android-preview] status: SYNCED');
      expect(result.stdout).not.toContain('[android-preview] begin: android-emulator');
      expect(result.stdout).not.toContain('[android-preview] begin: android-deploy');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }, 15000);

  it('stops when Capacitor sync fails instead of deploying stale output', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'android-preview-fail-'));
    try {
      const windowsSync = await writeExecutable(tempRoot, 'windows-sync.sh', '#!/usr/bin/env bash\necho sync-before-failure\n');
      const androidSync = await writeExecutable(tempRoot, 'android-sync.sh', '#!/usr/bin/env bash\necho cap-sync-failed\nexit 42\n');
      const failIfCalled = await writeExecutable(tempRoot, 'fail-if-called.sh', '#!/usr/bin/env bash\necho should-not-run\nexit 64\n');

      const result = await runAndroidPreview(tempRoot, {
        WINDOWS_SYNC_SCRIPT: windowsSync,
        ANDROID_SYNC_SCRIPT: androidSync,
        ANDROID_EMULATOR_SCRIPT: failIfCalled,
        ANDROID_DEPLOY_SCRIPT: failIfCalled,
        ANDROID_PREVIEW_AVD: 'Test_AVD',
        ANDROID_WINDOWS_MIRROR_DIR: path.join(tempRoot, 'android-preview-mirror')
      });

      expect(result.code).toBe(1);
      expect(result.stdout).toContain('cap-sync-failed');
      expect(result.stdout).toContain('[android-preview] failed at: android host sync');
      expect(result.stdout).toContain('[android-preview] status: FAILED');
      expect(result.stdout).not.toContain('should-not-run');
      expect(result.stdout).not.toContain('[android-preview] begin: android-emulator');
      expect(result.stdout).not.toContain('[android-preview] begin: android-deploy');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }, 15000);

  it('lite preview keeps emulator deployment but asks deploy to stop Gradle afterward', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'android-preview-lite-'));
    try {
      const windowsSync = await writeExecutable(tempRoot, 'windows-sync.sh', '#!/usr/bin/env bash\necho lite-sync\n');
      const androidSync = await writeExecutable(
        tempRoot,
        'android-sync.sh',
        '#!/usr/bin/env bash\necho lite-cap-sync\necho dependency-refresh:${ANDROID_WINDOWS_DEPENDENCY_REFRESH-unset}\n'
      );
      const emulator = await writeExecutable(tempRoot, 'emulator.sh', '#!/usr/bin/env bash\necho lite-emulator:$1\n');
      const deploy = await writeExecutable(tempRoot, 'deploy.sh', '#!/usr/bin/env bash\necho stop-gradle:${ANDROID_GRADLE_STOP_AFTER_DEPLOY-unset}\n');

      const result = await runAndroidPreview(
        tempRoot,
        {
          WINDOWS_SYNC_SCRIPT: windowsSync,
          ANDROID_SYNC_SCRIPT: androidSync,
          ANDROID_EMULATOR_SCRIPT: emulator,
          ANDROID_DEPLOY_SCRIPT: deploy,
          ANDROID_PREVIEW_AVD: 'Lite_AVD',
          ANDROID_WINDOWS_MIRROR_DIR: path.join(tempRoot, 'android-preview-mirror')
        },
        ANDROID_PREVIEW_LITE_SCRIPT
      );

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('lite-emulator:Lite_AVD');
      expect(result.stdout).toContain('stop-gradle:1');
      expect(result.stdout).toContain('dependency-refresh:skip');
      expect(result.stdout).toContain('[android-preview] status: OPENED');
      expect(result.stdout).toContain('lite-cap-sync');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }, 15000);
});
