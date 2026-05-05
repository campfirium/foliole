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

describe('android-preview.sh data protection default', () => {
  it('does not run backup and check unless Android data protection is explicitly enabled', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'android-preview-data-default-'));
    try {
      const windowsSync = await writeExecutable(tempRoot, 'windows-sync.sh', '#!/usr/bin/env bash\necho sync-ok\n');
      const androidSync = await writeExecutable(tempRoot, 'android-sync.sh', '#!/usr/bin/env bash\necho cap-sync-ok\n');
      const emulator = await writeExecutable(tempRoot, 'emulator.sh', '#!/usr/bin/env bash\necho emulator-ok\n');
      const deploy = await writeExecutable(tempRoot, 'deploy.sh', '#!/usr/bin/env bash\necho deploy-ok\n');
      const failIfCalled = await writeExecutable(tempRoot, 'data-protection.mjs', '#!/usr/bin/env node\nprocess.exit(64)\n');
      await mkdir(path.join(tempRoot, 'mirror'));

      const result = await runAndroidPreview(tempRoot, {
        ANDROID_DATA_PROTECTION_SCRIPT: failIfCalled,
        WINDOWS_SYNC_SCRIPT: windowsSync,
        ANDROID_SYNC_SCRIPT: androidSync,
        ANDROID_EMULATOR_SCRIPT: emulator,
        ANDROID_DEPLOY_SCRIPT: deploy,
        ANDROID_PREVIEW_AVD: 'Test_AVD',
        ANDROID_WINDOWS_MIRROR_DIR: path.join(tempRoot, 'mirror')
      });

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('[android-preview] step 1/4');
      expect(result.stdout).toContain('deploy-ok');
      expect(result.stdout).toContain('[android-preview] status: OPENED');
      expect(result.stdout).not.toContain('android-data-backup');
      expect(result.stdout).not.toContain('android-data-check');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }, 15000);
});
