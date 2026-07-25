// @vitest-environment node
/* global process */

import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { expect, it } from 'vitest';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ANDROID_PREVIEW_SCRIPT = path.join(REPO_ROOT, 'scripts', 'android', 'android-preview.sh');

function runAndroidPreview(cwd, env) {
  return new Promise((resolve) => {
    const child = spawn('bash', [ANDROID_PREVIEW_SCRIPT], {
      cwd,
      env: { ...process.env, ANDROID_PREVIEW_SYNC_STATE_CHECK: '0', ...env }
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('close', (code) => { resolve({ code, stderr, stdout }); });
  });
}

async function writeExecutable(rootDir, relativePath, content) {
  const fullPath = path.join(rootDir, relativePath);
  await writeFile(fullPath, content, { encoding: 'utf8', mode: 0o755 });
  return fullPath;
}

it('blocks backup and deploy when mirror Electron ABI preparation fails', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'android-preview-abi-fail-'));
  try {
    const mirror = path.join(tempRoot, 'mirror');
    await mkdir(mirror);
    const ok = await writeExecutable(tempRoot, 'ok.sh', '#!/usr/bin/env bash\necho sync-ok\n');
    const failIfCalled = await writeExecutable(
      tempRoot,
      'fail-if-called.sh',
      '#!/usr/bin/env bash\necho backup-or-deploy-ran\nexit 64\n'
    );
    await writeExecutable(
      mirror,
      'abi-fail.mjs',
      'console.log(`abi-cwd:${process.cwd()}`); console.log("abi-failed"); process.exit(1);\n'
    );

    const result = await runAndroidPreview(tempRoot, {
      ANDROID_DATA_PROTECTION: '1',
      ANDROID_DATA_PROTECTION_RUNTIME_ROOT: mirror,
      ANDROID_DATA_PROTECTION_SCRIPT: failIfCalled,
      ANDROID_DEPLOY_SCRIPT: failIfCalled,
      ANDROID_ELECTRON_ABI_PREPARE: '1',
      ANDROID_NATIVE_ABI_REPAIR_SCRIPT: 'abi-fail.mjs',
      ANDROID_SOURCE_SYNC_SCRIPT: ok,
      ANDROID_SYNC_SCRIPT: ok,
      ELECTRON_SQLITE_RUNNER: failIfCalled,
      FOLIOLE_ANDROID_SERIAL: 'A5-SERIAL',
      ANDROID_WINDOWS_MIRROR_DIR: mirror
    });

    expect(result.code).toBe(1);
    expect(result.stdout).toContain(`abi-cwd:${await realpath(mirror)}`);
    expect(result.stdout).toContain('[android-preview] failed at: Electron native ABI');
    expect(result.stdout).not.toContain('backup-or-deploy-ran');
    expect(result.stdout).not.toContain('[android-preview] begin: android-data-backup');
    expect(result.stdout).not.toContain('[android-preview] begin: android-deploy');
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}, 15000);
