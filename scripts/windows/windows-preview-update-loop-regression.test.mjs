// @vitest-environment node
/* global process */

import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { startIntentConsumer } from './windows-preview-regression-test-support.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PREVIEW_SCRIPT = path.join(REPO_ROOT, 'scripts', 'windows', 'windows-preview.sh');
const TEMP_ROOT_BASE = path.join(REPO_ROOT, '.tmp-tests');
const TEST_PREVIEW_TIMEOUTS = {
  WINDOWS_PREVIEW_TIMEOUT_SECONDS: '2',
  WINDOWS_PREVIEW_TIMEOUT_STATUS_SECONDS: '2',
  WINDOWS_PREVIEW_TIMEOUT_START_SECONDS: '4',
  WINDOWS_PREVIEW_TIMEOUT_RESTART_SECONDS: '4'
};

function runScript(env) {
  return new Promise((resolve) => {
    const child = spawn('bash', [PREVIEW_SCRIPT], {
      cwd: REPO_ROOT,
      env: {
        ...process.env,
        WINDOWS_NATIVE_ABI_CHECK_COMMAND: 'true',
        WINDOWS_NODE_MODULES_CHECK_COMMAND: 'true',
        ...TEST_PREVIEW_TIMEOUTS,
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

async function createMockScripts(root, clientBody) {
  const syncScript = path.join(root, 'mock-sync.sh');
  const clientScript = path.join(root, 'mock-client.sh');
  const freshnessScript = path.join(root, 'mock-freshness.mjs');
  const actionLog = path.join(root, 'actions.log');

  await writeFile(
    syncScript,
    [
      '#!/usr/bin/env bash',
      'set -euo pipefail',
      'if [ -n "${WINDOWS_SYNC_INCLUDE_DIST:-}" ]; then',
      '  echo "[windows-sync] include dist"',
      'fi',
      'echo "[windows-sync] status: SYNCED"'
    ].join('\n'),
    'utf8'
  );
  await writeFile(
    clientScript,
    [
      '#!/usr/bin/env bash',
      'set -euo pipefail',
      'echo "${WINDOWS_CLIENT_ACTION}" >> "${ACTION_LOG}"',
      clientBody
    ].join('\n'),
    'utf8'
  );
  await writeFile(freshnessScript, 'process.stdout.write("[check-electron-dist-fresh] status: FRESH\\n");\n', 'utf8');
  await writeFile(actionLog, '', 'utf8');

  return { actionLog, clientScript, freshnessScript, syncScript };
}

async function readActions(actionLog) {
  return (await readFile(actionLog, 'utf8'))
    .split('\n')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

describe('windows-preview update loop regressions', { timeout: 15000 }, () => {
  it('requests full restart for Class A after sync', async () => {
    await mkdir(TEMP_ROOT_BASE, { recursive: true });
    const tempRoot = await mkdtemp(path.join(TEMP_ROOT_BASE, 'windows-preview-regression-'));
    const consumer = startIntentConsumer(tempRoot, 'renderer-reload', REPO_ROOT);
    try {
      const { syncScript, clientScript, freshnessScript, actionLog } = await createMockScripts(
        tempRoot,
        [
          'if [ "${WINDOWS_CLIENT_ACTION}" = "status" ]; then',
          '  echo "[windows-restart-client] status: RUNNING trust=OK head=current-head"',
          '  exit 0',
          'fi',
          'if [ "${WINDOWS_CLIENT_ACTION}" = "full-restart" ]; then',
          '  echo "[windows-restart-client] status: RESTARTED"',
          '  exit 0',
          'fi',
          'exit 1'
        ].join('\n')
      );

      const result = await runScript({
        ACTION_LOG: actionLog,
        WINDOWS_ELECTRON_DIST_FRESHNESS_SCRIPT: freshnessScript,
        WINDOWS_SYNC_SCRIPT: syncScript,
        WINDOWS_CLIENT_SCRIPT: clientScript,
        WINDOWS_RESTART_INTENT_ROOT: tempRoot,
        WINDOWS_PREVIEW_CURRENT_HEAD: 'current-head',
        WINDOWS_PREVIEW_CHANGED_FILES: 'src/features/editor/model/liveMarkdownViewportPlans.ts'
      });

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('reason: Class A: renderer-only preview shell restart');
      expect(result.stdout).toContain('selected action: full-restart');
      expect(result.stdout).toContain('[windows-preview] status: STARTED');
      expect(await readActions(actionLog)).toEqual(['status', 'full-restart']);
    } finally {
      consumer.kill('SIGTERM');
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('classifies mixed renderer and electron changes as a runtime restart intent', async () => {
    await mkdir(TEMP_ROOT_BASE, { recursive: true });
    const tempRoot = await mkdtemp(path.join(TEMP_ROOT_BASE, 'windows-preview-regression-'));
    const consumer = startIntentConsumer(tempRoot, 'restart', REPO_ROOT);
    try {
      const { syncScript, clientScript, freshnessScript, actionLog } = await createMockScripts(
        tempRoot,
        [
          'if [ "${WINDOWS_CLIENT_ACTION}" = "status" ]; then',
          '  echo "[windows-restart-client] status: RUNNING trust=OK head=current-head"',
          '  exit 0',
          'fi',
          'exit 1'
        ].join('\n')
      );

      const result = await runScript({
        ACTION_LOG: actionLog,
        WINDOWS_ELECTRON_DIST_FRESHNESS_SCRIPT: freshnessScript,
        WINDOWS_SYNC_SCRIPT: syncScript,
        WINDOWS_CLIENT_SCRIPT: clientScript,
        WINDOWS_RESTART_INTENT_ROOT: tempRoot,
        WINDOWS_PREVIEW_CURRENT_HEAD: 'current-head',
        WINDOWS_PREVIEW_CHANGED_FILES: ['src/features/editor/model/liveMarkdownViewportPlans.ts', 'electron/main.ts'].join('\n'),
        WINDOWS_PREVIEW_TIMEOUT_RESTART_SECONDS: '4'
      });

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('reason: Class B: working tree runtime and renderer changes detected');
      expect(result.stdout).toContain('[windows-sync] include dist');
      expect(result.stdout).toContain('selected action: restart-intent');
      expect(result.stdout).toContain('status: STARTED');
      expect(await readActions(actionLog)).toEqual(['status', 'status']);
    } finally {
      consumer.kill('SIGTERM');
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('chooses fallback-start when the client is stopped even with electron changes', async () => {
    await mkdir(TEMP_ROOT_BASE, { recursive: true });
    const tempRoot = await mkdtemp(path.join(TEMP_ROOT_BASE, 'windows-preview-regression-'));
    try {
      const { syncScript, clientScript, freshnessScript, actionLog } = await createMockScripts(
        tempRoot,
        [
          'if [ "${WINDOWS_CLIENT_ACTION}" = "status" ]; then',
          '  if grep -q "^start$" "${ACTION_LOG}"; then',
          '    echo "[windows-restart-client] status: RUNNING trust=OK runtime_pid=501 head=current-head"',
          '    exit 0',
          '  fi',
          '  echo "[windows-restart-client] status: STOPPED reason=no-runtime"',
          '  exit 0',
          'fi',
          'if [ "${WINDOWS_CLIENT_ACTION}" = "start" ]; then',
          '  echo "[windows-restart-client] status: STARTED"',
          '  exit 0',
          'fi',
          'exit 1'
        ].join('\n')
      );

      const result = await runScript({
        ACTION_LOG: actionLog,
        WINDOWS_ELECTRON_DIST_FRESHNESS_SCRIPT: freshnessScript,
        WINDOWS_SYNC_SCRIPT: syncScript,
        WINDOWS_CLIENT_SCRIPT: clientScript,
        WINDOWS_RESTART_INTENT_ROOT: tempRoot,
        WINDOWS_PREVIEW_CHANGED_FILES: 'electron/main.ts'
      });

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('reason: Class C: no trusted running client (no-runtime)');
      expect(result.stdout).toContain('client status detail: status: STOPPED reason=no-runtime');
      expect(result.stdout).toContain('selected action: fallback-start');
      expect(result.stdout).not.toContain('selected action: restart-intent');
      const actions = await readActions(actionLog);
      expect(actions[0]).toBe('status');
      expect(actions[1]).toBe('start');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });
});
