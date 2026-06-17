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

describe('android-preview real device mode', () => {
  it('uses an explicit real device serial without starting an emulator', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'android-preview-real-device-'));
    try {
      const sourceSync = await writeExecutable(tempRoot, 'source-sync.sh', '#!/usr/bin/env bash\necho source-sync\n');
      const androidSync = await writeExecutable(tempRoot, 'android-sync.sh', '#!/usr/bin/env bash\necho android-sync\n');
      const failIfCalled = await writeExecutable(tempRoot, 'fail-if-called.sh', '#!/usr/bin/env bash\necho should-not-run\nexit 64\n');
      const deploy = await writeExecutable(tempRoot, 'deploy.sh', '#!/usr/bin/env bash\necho deploy-serial:${FOLIOLE_ANDROID_SERIAL}\n');

      const result = await runAndroidPreview(tempRoot, {
        ANDROID_SOURCE_SYNC_SCRIPT: sourceSync,
        ANDROID_SYNC_SCRIPT: androidSync,
        ANDROID_EMULATOR_SCRIPT: failIfCalled,
        ANDROID_DEPLOY_SCRIPT: deploy,
        ANDROID_PREVIEW_AVD: 'Would_Be_Skipped',
        FOLIOLE_ANDROID_SERIAL: 'phone-serial'
      });

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('real device target: phone-serial');
      expect(result.stdout).toContain('deploy-serial:phone-serial');
      expect(result.stdout).not.toContain('should-not-run');
      expect(result.stdout).not.toContain('[android-preview] begin: android-emulator');
      expect(result.stdout).toContain('[android-preview] status: OPENED');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }, 15000);
});
