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
const { hasPairingCredentials } = await import('./android-preview-sync-state.mjs');

function runAndroidPreview(cwd, env = {}) {
  return new Promise((resolve) => {
    const child = spawn('bash', [ANDROID_PREVIEW_SCRIPT], {
      cwd,
      env: {
        ...process.env,
        ANDROID_DATA_PROTECTION: '0',
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

describe('android-preview sync readiness check', () => {
  it('recognizes current and legacy native pairing preference keys', () => {
    expect(hasPairingCredentials('<string name="device_id">a</string><string name="device_secret">b</string>')).toBe(true);
    expect(hasPairingCredentials('<string name="pairing_device_id">a</string><string name="pairing_device_secret">b</string>')).toBe(true);
    expect(hasPairingCredentials('<string name="device_id">a</string>')).toBe(false);
  });

  it('can report sync readiness after deploy without blocking preview', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'android-preview-sync-state-'));
    try {
      const sourceSync = await writeExecutable(tempRoot, 'source-sync.sh', '#!/usr/bin/env bash\necho source-sync-ok\n');
      const androidSync = await writeExecutable(tempRoot, 'android-sync.sh', '#!/usr/bin/env bash\necho cap-sync-ok\n');
      const emulator = await writeExecutable(tempRoot, 'emulator.sh', '#!/usr/bin/env bash\necho emulator-ok\n');
      const deploy = await writeExecutable(tempRoot, 'deploy.sh', '#!/usr/bin/env bash\necho deploy-ok\n');
      const sqliteRunner = await writePassthroughSqliteRunner(tempRoot);
      const syncState = await writeExecutable(
        tempRoot,
        'sync-state.mjs',
        'console.log("[android-preview-sync-state] status: SYNC_NOT_READY");\n'
      );

      const result = await runAndroidPreview(tempRoot, {
        ANDROID_SOURCE_SYNC_SCRIPT: sourceSync,
        ANDROID_SYNC_SCRIPT: androidSync,
        ANDROID_EMULATOR_SCRIPT: emulator,
        ANDROID_DEPLOY_SCRIPT: deploy,
        ANDROID_SYNC_STATE_SCRIPT: syncState,
        ELECTRON_SQLITE_RUNNER: sqliteRunner,
        ANDROID_PREVIEW_AVD: 'Test_AVD',
        ANDROID_PREVIEW_SYNC_STATE_CHECK: '1',
        ANDROID_WINDOWS_MIRROR_DIR: path.join(tempRoot, 'android-preview-mirror')
      });

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('[android-preview] checking companion sync readiness');
      expect(result.stdout).toContain('[android-preview] begin: android-sync-state');
      expect(result.stdout).toContain('[android-preview-sync-state] status: SYNC_NOT_READY');
      expect(result.stdout).toContain('[android-preview] status: OPENED');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }, 15000);
});
