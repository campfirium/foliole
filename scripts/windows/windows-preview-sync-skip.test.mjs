// @vitest-environment node
/* global process */

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PREVIEW_SCRIPT = path.join(REPO_ROOT, 'scripts', 'windows', 'windows-preview.sh');

function runPreview(env) {
  return new Promise((resolve) => {
    const child = spawn('bash', [PREVIEW_SCRIPT], {
      cwd: REPO_ROOT,
      env: {
        ...process.env,
        WINDOWS_NATIVE_ABI_CHECK_COMMAND: 'true',
        WINDOWS_NODE_MODULES_CHECK_COMMAND: 'true',
        WINDOWS_PREVIEW_CHANGED_FILES: '',
        WINDOWS_PREVIEW_TIMEOUT_STATUS_SECONDS: '1',
        WINDOWS_PREVIEW_TIMEOUT_SECONDS: '1',
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

describe('windows preview sync skip', () => {
  it('does not run a full mirror sync when a sync stamp exists and no files changed', async () => {
    const tempParent = path.join(REPO_ROOT, '.tmp', 'windows-preview-sync-skip');
    await mkdir(tempParent, { recursive: true });
    const tempRoot = await mkdtemp(path.join(tempParent, 'case-'));
    const syncStamp = path.join(tempRoot, 'windows-sync.stamp');
    const syncScript = path.join(tempRoot, 'sync.sh');
    const clientScript = path.join(tempRoot, 'client.sh');
    const freshnessScript = path.join(tempRoot, 'freshness.mjs');
    try {
      await writeFile(syncStamp, '', 'utf8');
      await writeFile(syncScript, 'echo "[mock-sync] should-not-run"; exit 9\n', 'utf8');
      await writeFile(freshnessScript, 'process.stdout.write("[check-electron-dist-fresh] status: FRESH\\n");\n', 'utf8');
      await writeFile(
        clientScript,
        [
          '#!/usr/bin/env bash',
          'set -euo pipefail',
          'if [ "${WINDOWS_CLIENT_ACTION}" = "status" ]; then',
          '  echo "[windows-restart-client] status: RUNNING trust=OK head=current-head"',
          '  exit 0',
          'fi',
          'exit 1'
        ].join('\n'),
        'utf8'
      );

      const result = await runPreview({
        WINDOWS_CLIENT_SCRIPT: clientScript,
        WINDOWS_ELECTRON_DIST_FRESHNESS_SCRIPT: freshnessScript,
        WINDOWS_PREVIEW_CURRENT_HEAD: 'current-head',
        WINDOWS_PREVIEW_SYNC_STAMP_FILE: syncStamp,
        WINDOWS_SYNC_SCRIPT: syncScript
      });

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('sync skipped: no changed files since last mirror sync');
      expect(result.stdout).not.toContain('[mock-sync] should-not-run');
      expect(result.stdout).toContain('status: STARTED');
    } finally {
      await rm(tempRoot, { force: true, recursive: true });
    }
  }, 15000);

  it('does not scan or sync changed files when already running inside the Windows mirror', async () => {
    const tempRoot = await mkdtemp(path.join(REPO_ROOT, '.tmp', 'windows-preview-mirror-skip-'));
    const syncScript = path.join(tempRoot, 'sync.sh');
    const clientScript = path.join(tempRoot, 'client.sh');
    const freshnessScript = path.join(tempRoot, 'freshness.mjs');
    try {
      await writeFile(syncScript, 'echo "[mock-sync] should-not-run"; exit 9\n', 'utf8');
      await writeFile(freshnessScript, 'process.stdout.write("[check-electron-dist-fresh] status: FRESH\\n");\n', 'utf8');
      await writeFile(
        clientScript,
        [
          '#!/usr/bin/env bash',
          'set -euo pipefail',
          'if [ "${WINDOWS_CLIENT_ACTION}" = "status" ]; then',
          '  echo "[windows-restart-client] status: RUNNING trust=OK head=current-head"',
          '  exit 0',
          'fi',
          'exit 1'
        ].join('\n'),
        'utf8'
      );

      const result = await runPreview({
        WINDOWS_CLIENT_SCRIPT: clientScript,
        WINDOWS_ELECTRON_DIST_FRESHNESS_SCRIPT: freshnessScript,
        WINDOWS_MIRROR_DIR: REPO_ROOT,
        WINDOWS_PREVIEW_CHANGED_FILES: 'electron/main.ts',
        WINDOWS_PREVIEW_CURRENT_HEAD: 'current-head',
        WINDOWS_SYNC_SCRIPT: syncScript
      });

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('sync skipped: running inside windows mirror');
      expect(result.stdout).not.toContain('[mock-sync] should-not-run');
      expect(result.stdout).toContain('reason: Class A: no runtime changes detected');
      expect(result.stdout).toContain('status: STARTED');
    } finally {
      await rm(tempRoot, { force: true, recursive: true });
    }
  }, 15000);
});
