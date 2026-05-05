// @vitest-environment node
/* global process */

import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PREVIEW_SCRIPT = path.join(REPO_ROOT, 'scripts', 'windows', 'windows-preview.sh');
const RESTART_INTENT_FILE = '.windows-dev-restart-intent.json';
const RESTART_DELIVERY_FILE = '.windows-dev-restart-delivered.json';
const RENDERER_RELOAD_INTENT_FILE = '.windows-dev-renderer-reload-intent.json';
const RENDERER_RELOAD_DELIVERY_FILE = '.windows-dev-renderer-reload-delivered.json';

function runScript(env) {
  return new Promise((resolve) => {
    const child = spawn('bash', [PREVIEW_SCRIPT], {
      cwd: REPO_ROOT,
      env: { ...process.env, ...env }
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
      'if [ -n "${WINDOWS_SYNC_INCLUDE_ELECTRON_DIST:-}" ]; then',
      '  echo "[windows-sync] include electron-dist"',
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

async function readRestartDelivery(rootDir) {
  return JSON.parse(await readFile(path.join(rootDir, RESTART_DELIVERY_FILE), 'utf8'));
}

async function readRendererReloadDelivery(rootDir) {
  return JSON.parse(await readFile(path.join(rootDir, RENDERER_RELOAD_DELIVERY_FILE), 'utf8'));
}

function startIntentConsumer(rootDir, mode) {
  const script = `
const fs = require('node:fs');
const path = require('node:path');
const rootDir = process.argv[1];
const mode = process.argv[2];
const intentFile = path.join(rootDir, mode === 'restart' ? '${RESTART_INTENT_FILE}' : '${RENDERER_RELOAD_INTENT_FILE}');
const deliveryFile = path.join(rootDir, mode === 'restart' ? '${RESTART_DELIVERY_FILE}' : '${RENDERER_RELOAD_DELIVERY_FILE}');
const bootReadyFile = path.join(rootDir, '.windows-native-boot-ready.json');
const bridgeReadyFile = path.join(rootDir, '.windows-native-bridge-ready.json');
function writeJson(filePath, payload) {
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2) + '\\n', 'utf8');
}
const start = Date.now();
const timer = setInterval(() => {
  if (!fs.existsSync(intentFile)) {
    if (Date.now() - start > 15000) {
      clearInterval(timer);
      process.exit(0);
    }
    return;
  }
  const payload = JSON.parse(fs.readFileSync(intentFile, 'utf8'));
  fs.unlinkSync(intentFile);
  writeJson(deliveryFile, {
    deliveredAt: new Date().toISOString(),
    head: payload.head ?? null,
    kind: mode === 'restart' ? 'foliole.electron.dev.restart-delivered.v1' : 'foliole.electron.dev.renderer-reload-delivered.v1',
    nonce: payload.nonce,
    reason: payload.reason,
    requestedAt: payload.requestedAt,
    requestedBy: payload.requestedBy,
    target: payload.target
  });
  if (mode === 'restart') {
    writeJson(bootReadyFile, {
      head: payload.head ?? null,
      pid: 501,
      session: 'session-1',
      stage: 'app_ready',
      timestamp: new Date(Date.parse(payload.requestedAt) + 1000).toISOString()
    });
    writeJson(bridgeReadyFile, {
      head: payload.head ?? null,
      pid: 501,
      session: 'session-1',
      stage: 'bridge_ready',
      timestamp: new Date(Date.parse(payload.requestedAt) + 2000).toISOString(),
      payload: { bridgeAvailable: true }
    });
  }
  clearInterval(timer);
  process.exit(0);
}, 50);
`;

  return spawn(process.execPath, ['-e', script, rootDir, mode], {
    cwd: REPO_ROOT,
    stdio: 'ignore'
  });
}

describe('windows-preview update loop regressions', { timeout: 15000 }, () => {
  it('requests renderer reload intent for Class A after sync', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'windows-preview-regression-'));
    const consumer = startIntentConsumer(tempRoot, 'renderer-reload');
    try {
      const { syncScript, clientScript, freshnessScript, actionLog } = await createMockScripts(
        tempRoot,
        [
          'if [ "${WINDOWS_CLIENT_ACTION}" = "status" ]; then',
          '  echo "[windows-restart-client] status: RUNNING head=current-head"',
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
        WINDOWS_PREVIEW_CHANGED_FILES: 'src/app/App.tsx'
      });
      const rendererReloadDelivery = await readRendererReloadDelivery(tempRoot);

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('selected action: renderer-reload-intent');
      expect(result.stdout).toContain('windows-renderer-reload-intent] status: REQUESTED nonce=1');
      expect(result.stdout).toContain('status: DELIVERED');
      expect(rendererReloadDelivery).toMatchObject({
        nonce: 1,
        head: 'current-head',
        reason: 'Class A: renderer-only sync path',
        target: 'electron-dev-renderer'
      });
      expect(await readActions(actionLog)).toEqual(['status', 'status']);
    } finally {
      consumer.kill('SIGTERM');
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('classifies mixed renderer and electron changes as Class B restart-intent', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'windows-preview-regression-'));
    const consumer = startIntentConsumer(tempRoot, 'restart');
    try {
      const { syncScript, clientScript, freshnessScript, actionLog } = await createMockScripts(
        tempRoot,
        [
          'if [ "${WINDOWS_CLIENT_ACTION}" = "status" ]; then',
          '  if [ -f "${WINDOWS_RESTART_INTENT_ROOT}/.windows-dev-restart-delivered.json" ]; then',
          '    echo "[windows-restart-client] status: RUNNING head=current-head"',
          '    exit 0',
          '  fi',
          '  echo "[windows-restart-client] status: RUNNING head=current-head"',
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
        WINDOWS_PREVIEW_CHANGED_FILES: ['src/app/App.tsx', 'electron/preload.ts'].join('\n')
      });

      const restartDelivery = await readRestartDelivery(tempRoot);

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('reason: Class B: working tree electron changes detected');
      expect(result.stdout).toContain('[windows-sync] include electron-dist');
      expect(result.stdout).toContain('selected action: restart-intent');
      expect(result.stdout).toContain('status: RESTARTED');
      expect(restartDelivery).toMatchObject({
        nonce: 1,
        head: 'current-head',
        reason: 'Class B: working tree electron changes detected'
      });
      expect(await readActions(actionLog)).toEqual(['status', 'status']);
    } finally {
      consumer.kill('SIGTERM');
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('chooses fallback-start when the client is stopped even with electron changes', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'windows-preview-regression-'));
    try {
      const { syncScript, clientScript, freshnessScript, actionLog } = await createMockScripts(
        tempRoot,
        [
          'if [ "${WINDOWS_CLIENT_ACTION}" = "status" ]; then',
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
      expect(await readActions(actionLog)).toEqual(['status', 'start']);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });
});
