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

describe('android-preview incremental sync', () => {
  it('falls back to full windows sync when the changed file list is too large for env', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'android-preview-changes-'));
    try {
      const mockBinDir = path.join(tempRoot, 'bin');
      await mkdir(mockBinDir);
      await writeExecutable(tempRoot, 'bin/wslpath', '#!/usr/bin/env bash\necho "/mnt/c/dev/foliole-android-preview"\n');
      const windowsSync = await writeExecutable(tempRoot, 'windows-sync.sh', [
        '#!/usr/bin/env bash',
        'echo sync-changed:${WINDOWS_SYNC_CHANGED_FILES}',
        'echo sync-target:${WINDOWS_MIRROR_DIR}'
      ].join('\n'));
      const mtimeChanges = await writeExecutable(tempRoot, 'mtime-changes.sh', [
        '#!/usr/bin/env bash',
        'resolve_changed_files() {',
        '  printf "changed-file-%04d\\n" {1..20}',
        '}'
      ].join('\n'));
      const androidSync = await writeExecutable(tempRoot, 'android-sync.sh', '#!/usr/bin/env bash\necho android-sync\n');
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
        ANDROID_PREVIEW_CHANGED_FILES_ENV_MAX_BYTES: '20',
        ANDROID_PREVIEW_OPEN_STUDIO: '0'
      });

      expect(result.code).toBe(0);
      expect(result.stderr).toContain('changed file list too large; falling back to full windows sync');
      expect(result.stdout).toContain('sync-changed:\n');
      expect(result.stdout).toContain('android-sync');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }, 15000);
});
