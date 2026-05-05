// @vitest-environment node
/* global process */

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
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
  it('prints step boundaries and deploy timeout details', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'android-preview-'));
    try {
      const windowsSync = await writeExecutable(tempRoot, 'windows-sync.sh', '#!/usr/bin/env bash\necho sync-target:${WINDOWS_MIRROR_DIR}\necho preserve-android-generated:${WINDOWS_SYNC_PRESERVE_ANDROID_GENERATED}\n');
      const androidSync = await writeExecutable(tempRoot, 'android-sync.sh', '#!/usr/bin/env bash\necho android-workdir:${ANDROID_WINDOWS_WORKDIR}\n');
      const emulator = await writeExecutable(tempRoot, 'emulator.sh', '#!/usr/bin/env bash\necho emulator-ready\n');
      const deploy = await writeExecutable(tempRoot, 'deploy.sh', '#!/usr/bin/env bash\necho deploy-workdir:${ANDROID_WINDOWS_WORKDIR}\n');

      const result = await runAndroidPreview(tempRoot, {
        WINDOWS_SYNC_SCRIPT: windowsSync,
        ANDROID_SYNC_SCRIPT: androidSync,
        ANDROID_EMULATOR_SCRIPT: emulator,
        ANDROID_DEPLOY_SCRIPT: deploy,
        ANDROID_PREVIEW_AVD: 'Test_AVD',
        ANDROID_PREVIEW_DEPLOY_TIMEOUT_SECONDS: '123',
        ANDROID_WINDOWS_MIRROR_DIR: path.join(tempRoot, 'android-preview-mirror'),
        ANDROID_WINDOWS_WORKDIR: 'C:\\dev\\foliole-android-preview-test'
      });

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('[android-preview] begin: windows-sync');
      expect(result.stdout).toContain(`sync-target:${path.join(tempRoot, 'android-preview-mirror')}`);
      expect(result.stdout).toContain('preserve-android-generated:1');
      expect(result.stdout).toContain('android-workdir:C:\\dev\\foliole-android-preview-test');
      expect(result.stdout).toContain('deploy-workdir:C:\\dev\\foliole-android-preview-test');
      expect(result.stdout).toContain('[android-preview] done: windows-sync');
      expect(result.stdout).toContain('[android-preview] begin: android-cap-sync');
      expect(result.stdout).toContain('[android-preview] done: android-cap-sync');
      expect(result.stdout).toContain('[android-preview] begin: android-emulator');
      expect(result.stdout).toContain('[android-preview] done: android-emulator');
      expect(result.stdout).toContain('[android-preview] deploy timeout: 123s');
      expect(result.stdout).toContain('[android-preview] begin: android-deploy');
      expect(result.stdout).toContain('[android-preview] done: android-deploy');
      expect(result.stdout).toContain('[android-preview] status: OPENED');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }, 15000);
});
