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
const TEST_IDLE_TIMEOUT_MS = 30_000;
const TEST_PREVIEW_TIMEOUTS = {
  WINDOWS_PREVIEW_TIMEOUT_SECONDS: '2',
  WINDOWS_PREVIEW_TIMEOUT_STATUS_SECONDS: '2',
  WINDOWS_PREVIEW_TIMEOUT_START_SECONDS: '3',
  WINDOWS_PREVIEW_TIMEOUT_RESTART_SECONDS: '3'
};

function runScript(env) {
  return new Promise((resolve) => {
    const child = spawn('bash', [PREVIEW_SCRIPT], {
      cwd: REPO_ROOT,
    env: {
      ...process.env,
      WINDOWS_NATIVE_ABI_CHECK_COMMAND: 'true',
      WINDOWS_NODE_MODULES_CHECK_COMMAND: 'true',
      WINDOWS_STARTUP_DIAGNOSTICS_SCRIPT: path.join(os.tmpdir(), 'missing-windows-startup-diagnostics.mjs'),
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
  const electronDistSyncScript = path.join(root, 'mock-electron-dist-sync.mjs');
  const compileScript = path.join(root, 'mock-compile.sh');
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
  await writeFile(
    electronDistSyncScript,
    [
      'import { appendFileSync } from "node:fs";',
      'appendFileSync(process.env.ACTION_LOG, "electron-dist-sync\\n");',
      'process.stdout.write("[electron-dist-sync] status: SYNCED files=1\\n");'
    ].join('\n'),
    'utf8'
  );
  await writeFile(freshnessScript, 'process.stdout.write("[check-electron-dist-fresh] status: FRESH\\n");\n', 'utf8');
  await writeFile(
    compileScript,
    [
      '#!/usr/bin/env bash',
      'set -euo pipefail',
      'cat <<\'EOF\' > "${MOCK_FRESHNESS_SCRIPT}"',
      'process.stdout.write("[check-electron-dist-fresh] status: FRESH\\\\n");',
      'EOF',
      'echo "[mock-electron-compile] status: COMPILED"'
    ].join('\n'),
    'utf8'
  );
  await writeFile(actionLog, '', 'utf8');

  return { actionLog, clientScript, compileScript, electronDistSyncScript, freshnessScript, syncScript };
}

async function readActions(actionLog) {
  return (await readFile(actionLog, 'utf8'))
    .split('\n')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function expectFallbackStartActions(actions) {
  expect(actions.slice(0, 2)).toEqual(['status', 'start']);
  expect(actions.length).toBeGreaterThanOrEqual(2);
  expect(actions.length).toBeLessThanOrEqual(4);
  expect(actions.slice(2).every((action) => action === 'status')).toBe(true);
}

async function readRestartDelivery(rootDir) {
  return JSON.parse(await readFile(path.join(rootDir, RESTART_DELIVERY_FILE), 'utf8'));
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
    if (Date.now() - start > ${TEST_IDLE_TIMEOUT_MS}) {
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
  if (mode === 'restart' || mode === 'renderer-reload') {
    const readyTimestamp = new Date(Date.parse(payload.requestedAt) + 1000).toISOString();
    writeJson(bootReadyFile, {
      head: payload.head ?? null,
      pid: 501,
      session: 'session-1',
      stage: 'app_ready',
      timestamp: readyTimestamp
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

function startRestartDeliveryConsumer(rootDir, timeoutMs = TEST_IDLE_TIMEOUT_MS) {
  const script = `
const fs = require('node:fs');
const path = require('node:path');

const rootDir = process.argv[1];
const timeoutMs = Number(process.argv[2]);
const intentFile = path.join(rootDir, '${RESTART_INTENT_FILE}');
const deliveryFile = path.join(rootDir, '${RESTART_DELIVERY_FILE}');
const bootReadyFile = path.join(rootDir, '.windows-native-boot-ready.json');
const bridgeReadyFile = path.join(rootDir, '.windows-native-bridge-ready.json');

function writeJson(filePath, payload) {
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2) + '\\n', 'utf8');
}

const start = Date.now();
const timer = setInterval(() => {
  if (!fs.existsSync(intentFile)) {
    if (Date.now() - start > timeoutMs) {
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
    kind: 'foliole.electron.dev.restart-delivered.v1',
    nonce: payload.nonce,
    reason: payload.reason,
    requestedAt: payload.requestedAt,
    requestedBy: payload.requestedBy,
    target: payload.target
  });
  const readyTimestamp = new Date(Date.parse(payload.requestedAt) + 1000).toISOString();
  writeJson(bootReadyFile, {
    head: payload.head ?? null,
    pid: 501,
    session: 'session-1',
    stage: 'app_ready',
    timestamp: readyTimestamp
  });
  writeJson(bridgeReadyFile, {
    head: payload.head ?? null,
    pid: 501,
    session: 'session-1',
    stage: 'bridge_ready',
    timestamp: new Date(Date.parse(payload.requestedAt) + 2000).toISOString(),
    payload: { bridgeAvailable: true }
  });
  clearInterval(timer);
  process.exit(0);
}, 50);
`;

  return spawn(process.execPath, ['-e', script, rootDir, String(timeoutMs)], {
    cwd: REPO_ROOT,
    stdio: 'ignore'
  });
}

describe('windows-preview script', { timeout: 15000 }, () => {
  it('stops before client actions when the Windows mirror dependencies are not installed', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'windows-preview-test-'));
    try {
      const { syncScript, clientScript, freshnessScript, actionLog } = await createMockScripts(
        tempRoot,
        ['echo "unexpected client action ${WINDOWS_CLIENT_ACTION}"', 'exit 1'].join('\n')
      );

      const result = await runScript({
        ACTION_LOG: actionLog,
        WINDOWS_ELECTRON_DIST_FRESHNESS_SCRIPT: freshnessScript,
        WINDOWS_NODE_MODULES_CHECK_COMMAND:
          'echo "missing: @tanstack/react-virtual"; echo "npm install required" >&2; exit 1',
        WINDOWS_SYNC_SCRIPT: syncScript,
        WINDOWS_CLIENT_SCRIPT: clientScript,
        WINDOWS_PREVIEW_CHANGED_FILES: 'src/shared/ui/VirtualListSurface.tsx'
      });

      expect(result.code).toBe(1);
      expect(result.stdout).toContain('step 3/4: verify windows node_modules');
      expect(result.stdout).toContain('windows node_modules check failed');
      expect(result.stdout).toContain('restore Electron native ABI before preview');
      expect(result.stdout).toContain('do not run plain Node npm rebuild for better-sqlite3');
      expect(result.stdout).toContain('missing: @tanstack/react-virtual');
      expect(result.stdout).toContain('npm install required');
      expect(result.stdout).not.toContain('step 4/4: apply update action');
      expect(await readActions(actionLog)).toEqual([]);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('rebuilds stale electron-dist before sync instead of failing early', { timeout: 30000 }, async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'windows-preview-test-'));
    const consumer = startIntentConsumer(tempRoot, 'renderer-reload');
    try {
      const { syncScript, clientScript, compileScript, freshnessScript, actionLog } = await createMockScripts(
        tempRoot,
        [
          'if [ "${WINDOWS_CLIENT_ACTION}" = "status" ]; then',
          '  echo "[windows-restart-client] status: RUNNING trust=OK"',
          '  exit 0',
          'fi',
          'if [ "${WINDOWS_CLIENT_ACTION}" = "full-restart" ]; then',
          '  echo "[windows-restart-client] status: RESTARTED"',
          '  exit 0',
          'fi',
          'exit 1'
        ].join('\n')
      );

      await writeFile(
        freshnessScript,
        [
          'process.stdout.write("[check-electron-dist-fresh] status: STALE reason=source-newer-than-compiled-output\\n");',
          'process.exit(1);'
        ].join('\n'),
        'utf8'
      );

      const result = await runScript({
        ACTION_LOG: actionLog,
        MOCK_FRESHNESS_SCRIPT: freshnessScript,
        WINDOWS_ELECTRON_COMPILE_COMMAND: `bash ${compileScript}`,
        WINDOWS_ELECTRON_DIST_FRESHNESS_SCRIPT: freshnessScript,
        WINDOWS_SYNC_SCRIPT: syncScript,
        WINDOWS_CLIENT_SCRIPT: clientScript,
        WINDOWS_RESTART_INTENT_ROOT: tempRoot,
        WINDOWS_PREVIEW_CHANGED_FILES: 'src/app/components/SearchPalette.tsx'
      });

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('step 1/4: verify electron-dist freshness');
      expect(result.stdout).toContain('electron-dist stale; compiling runtime bundle');
      expect(result.stdout).toContain('[mock-electron-compile] status: COMPILED');
      expect(result.stdout).toContain('[windows-sync] status: SYNCED');
      expect(result.stdout).toContain('[windows-preview] status: STARTED');
      expect(await readActions(actionLog)).toEqual(['status', 'full-restart']);
    } finally {
      consumer.kill('SIGTERM');
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('chooses full restart for ordinary Class A renderer changes on a trusted running client', { timeout: 30000 }, async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'windows-preview-test-'));
    const consumer = startIntentConsumer(tempRoot, 'renderer-reload');
    try {
      const { syncScript, clientScript, electronDistSyncScript, freshnessScript, actionLog } = await createMockScripts(
        tempRoot,
        [
          'if [ "${WINDOWS_CLIENT_ACTION}" = "status" ]; then',
          '  echo "[windows-restart-client] status: RUNNING trust=OK"',
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
        WINDOWS_ELECTRON_DIST_SYNC_SCRIPT: electronDistSyncScript,
        WINDOWS_SYNC_SCRIPT: syncScript,
        WINDOWS_CLIENT_SCRIPT: clientScript,
        WINDOWS_RESTART_INTENT_ROOT: tempRoot,
        WINDOWS_PREVIEW_CHANGED_FILES: 'src/app/components/SearchPalette.tsx'
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

  it('chooses restart-intent when committed runtime changes and renderer source changes are both pending', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'windows-preview-test-'));
    const consumer = startIntentConsumer(tempRoot, 'restart');
    try {
      const { syncScript, clientScript, freshnessScript, actionLog } = await createMockScripts(
        tempRoot,
        [
          'if [ "${WINDOWS_CLIENT_ACTION}" = "status" ]; then',
          '  if [ -f "${WINDOWS_RESTART_INTENT_ROOT}/.windows-dev-restart-delivered.json" ]; then',
          '    echo "[windows-restart-client] status: RUNNING trust=OK head=old-head"',
          '    exit 0',
          '  fi',
          '  echo "[windows-restart-client] status: RUNNING trust=OK head=old-head"',
          '  exit 0',
          'fi',
          'exit 1'
        ].join('\n')
      );

      const result = await runScript({
        ACTION_LOG: actionLog,
        WINDOWS_ELECTRON_DIST_FRESHNESS_SCRIPT: freshnessScript,
        WINDOWS_PREVIEW_CURRENT_HEAD: 'old-head',
        WINDOWS_PREVIEW_CHANGED_FILES: 'src/features/editor/adapters/liveMarkdownTheme.ts',
        WINDOWS_PREVIEW_COMMITTED_ELECTRON_CHANGES: '1',
        WINDOWS_RESTART_INTENT_ROOT: tempRoot,
        WINDOWS_SYNC_SCRIPT: syncScript,
        WINDOWS_CLIENT_SCRIPT: clientScript
      });

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('reason: Class B: runtime behind committed electron changes with renderer changes');
      expect(result.stdout).toContain('selected action: restart-intent');
      expect(result.stdout).toContain('restart delivery acknowledged nonce=1');
      expect(result.stdout).toContain('status: STARTED');
      expect(await readActions(actionLog)).toEqual(['status', 'status']);
    } finally {
      consumer.kill('SIGTERM');
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('chooses restart-intent for Class B working tree electron changes', { timeout: 30000 }, async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'windows-preview-test-'));
    const consumer = startRestartDeliveryConsumer(tempRoot, 30_000);
    try {
      const { syncScript, clientScript, electronDistSyncScript, freshnessScript, actionLog } = await createMockScripts(
        tempRoot,
        [
          'if [ "${WINDOWS_CLIENT_ACTION}" = "status" ]; then',
          '  if [ -f "${WINDOWS_RESTART_INTENT_ROOT}/.windows-dev-restart-delivered.json" ]; then',
          '    echo "[windows-restart-client] status: RUNNING trust=OK head=$(node -e "const fs=require(\\"node:fs\\");const p=JSON.parse(fs.readFileSync(process.argv[1],\\"utf8\\"));process.stdout.write(p.head||\\"\\")" "${WINDOWS_RESTART_INTENT_ROOT}/.windows-dev-restart-delivered.json")"',
          '    exit 0',
          '  fi',
          '  echo "[windows-restart-client] status: RUNNING trust=OK head=old-head"',
          '  exit 0',
          'fi',
          'exit 1'
        ].join('\n')
      );

      const result = await runScript({
        ACTION_LOG: actionLog,
        WINDOWS_ELECTRON_DIST_FRESHNESS_SCRIPT: freshnessScript,
        WINDOWS_ELECTRON_DIST_SYNC_SCRIPT: electronDistSyncScript,
        WINDOWS_SYNC_SCRIPT: syncScript,
        WINDOWS_CLIENT_SCRIPT: clientScript,
        WINDOWS_RESTART_INTENT_ROOT: tempRoot,
        WINDOWS_PREVIEW_CURRENT_HEAD: 'old-head',
        WINDOWS_PREVIEW_CHANGED_FILES: 'electron/main.ts',
        WINDOWS_PREVIEW_TIMEOUT_RESTART_SECONDS: '10'
      });

      const restartDelivery = await readRestartDelivery(tempRoot);

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('reason: Class B: working tree electron changes detected');
      expect(result.stdout).toContain('[electron-dist-sync] status: SYNCED files=1');
      expect(result.stdout).not.toContain('[windows-sync] include electron-dist');
      expect(result.stdout).toContain('selected action: restart-intent');
      expect(result.stdout).toContain('status: REQUESTED nonce=1');
      expect(result.stdout).toContain('restart delivery acknowledged nonce=1');
      expect(result.stdout).toContain('restart markers updated');
      expect(result.stdout).toContain('restart status:');
      expect(result.stdout).toContain('status: STARTED');
      expect(restartDelivery).toMatchObject({
        nonce: 1,
        requestedBy: 'wsl-windows-preview',
        target: 'electron-dev',
        reason: 'Class B: working tree electron changes detected'
      });
      expect(await readActions(actionLog)).toEqual(['electron-dist-sync', 'status', 'status']);
    } finally {
      consumer.kill('SIGTERM');
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('chooses restart-intent when runtime head is behind committed electron changes', { timeout: 30000 }, async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'windows-preview-test-'));
    const consumer = startIntentConsumer(tempRoot, 'restart');
    try {
      const { syncScript, clientScript, electronDistSyncScript, freshnessScript, actionLog } = await createMockScripts(
        tempRoot,
        [
          'if [ "${WINDOWS_CLIENT_ACTION}" = "status" ]; then',
          '  if [ -f "${WINDOWS_RESTART_INTENT_ROOT}/.windows-dev-restart-delivered.json" ]; then',
          '    echo "[windows-restart-client] status: RUNNING trust=OK head=new-head"',
          '    exit 0',
          '  fi',
          '  echo "[windows-restart-client] status: RUNNING trust=OK head=new-head"',
          '  exit 0',
          'fi',
          'exit 1'
        ].join('\n')
      );

      const result = await runScript({
        ACTION_LOG: actionLog,
        WINDOWS_ELECTRON_DIST_FRESHNESS_SCRIPT: freshnessScript,
        WINDOWS_ELECTRON_DIST_SYNC_SCRIPT: electronDistSyncScript,
        WINDOWS_SYNC_SCRIPT: syncScript,
        WINDOWS_CLIENT_SCRIPT: clientScript,
        WINDOWS_RESTART_INTENT_ROOT: tempRoot,
        WINDOWS_PREVIEW_CHANGED_FILES: 'electron/ipc/commands.test.ts',
        WINDOWS_PREVIEW_CURRENT_HEAD: 'new-head',
        WINDOWS_PREVIEW_COMMITTED_ELECTRON_CHANGES: 'electron/main.ts'
      });

      const restartDelivery = await readRestartDelivery(tempRoot);

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('reason: Class B: runtime behind committed electron changes');
      expect(result.stdout).toContain('selected action: restart-intent');
      expect(result.stdout).toContain('status: REQUESTED nonce=1');
      expect(result.stdout).toContain('restart delivery acknowledged nonce=1');
      expect(result.stdout).toContain('restart markers updated');
      expect(result.stdout).toContain('restart status:');
      expect(result.stdout).toContain('status: STARTED');
      expect(restartDelivery).toMatchObject({
        nonce: 1,
        head: 'new-head',
        reason: 'Class B: runtime behind committed electron changes'
      });
      expect(await readActions(actionLog)).toEqual(['status', 'status']);
    } finally {
      consumer.kill('SIGTERM');
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('chooses fallback-start for Class C when no trusted client is running', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'windows-preview-test-'));
    const startedMarker = path.join(tempRoot, 'started.flag');
    try {
      const { syncScript, clientScript, freshnessScript, actionLog } = await createMockScripts(
        tempRoot,
        [
          'if [ "${WINDOWS_CLIENT_ACTION}" = "status" ]; then',
          '  if [ -f "${STARTED_MARKER}" ]; then',
          '    echo "[windows-restart-client] status: RUNNING trust=OK shell_pid=500 runtime_pid=501 head=current-head"',
          '  else',
          '  echo "[windows-restart-client] status: STOPPED reason=stale-runtime-detected"',
          '  fi',
          '  exit 0',
          'fi',
          'if [ "${WINDOWS_CLIENT_ACTION}" = "start" ]; then',
          '  : > "${STARTED_MARKER}"',
          '  echo "[windows-restart-client] status: STARTED"',
          '  exit 0',
          'fi',
          'exit 1'
        ].join('\n')
      );

      const result = await runScript({
        ACTION_LOG: actionLog,
        STARTED_MARKER: startedMarker,
        WINDOWS_ELECTRON_DIST_FRESHNESS_SCRIPT: freshnessScript,
        WINDOWS_SYNC_SCRIPT: syncScript,
        WINDOWS_CLIENT_SCRIPT: clientScript,
        WINDOWS_PREVIEW_CURRENT_HEAD: 'current-head',
        WINDOWS_PREVIEW_CHANGED_FILES: 'src/app/App.tsx'
      });

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('reason: Class C: no trusted running client (stale-runtime-detected)');
      expect(result.stdout).toContain('client status detail: status: STOPPED reason=stale-runtime-detected');
      expect(result.stdout).toContain('selected action: fallback-start');
      expect(result.stdout).toContain('status: STARTED');
      expectFallbackStartActions(await readActions(actionLog));
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('treats bridge-missing status as an untrusted visible window and forces a clean start path', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'windows-preview-test-'));
    const startedMarker = path.join(tempRoot, 'started.flag');
    try {
      const { syncScript, clientScript, freshnessScript, actionLog } = await createMockScripts(
        tempRoot,
        [
          'if [ "${WINDOWS_CLIENT_ACTION}" = "status" ]; then',
          '  if [ -f "${STARTED_MARKER}" ]; then',
          '    echo "[windows-restart-client] status: RUNNING trust=OK shell_pid=500 runtime_pid=501 head=current-head"',
          '  else',
          '  echo "[windows-restart-client] status: STOPPED reason=bridge-ready-missing shell_pid=400 runtime_pid=401 marker_pid=401"',
          '  fi',
          '  exit 0',
          'fi',
          'if [ "${WINDOWS_CLIENT_ACTION}" = "start" ]; then',
          '  : > "${STARTED_MARKER}"',
          '  echo "[windows-restart-client] discarded untrusted runtime pid=401 reason=bridge-ready-missing marker_pid=401"',
          '  echo "[windows-restart-client] status: STARTED shell_pid=500 runtime_pid=501"',
          '  exit 0',
          'fi',
          'exit 1'
        ].join('\n')
      );

      const result = await runScript({
        ACTION_LOG: actionLog,
        STARTED_MARKER: startedMarker,
        WINDOWS_ELECTRON_DIST_FRESHNESS_SCRIPT: freshnessScript,
        WINDOWS_SYNC_SCRIPT: syncScript,
        WINDOWS_CLIENT_SCRIPT: clientScript,
        WINDOWS_PREVIEW_CURRENT_HEAD: 'current-head',
        WINDOWS_PREVIEW_CHANGED_FILES: 'src/app/App.tsx'
      });

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('reason: Class C: no trusted running client (bridge-ready-missing)');
      expect(result.stdout).toContain(
        'client status detail: status: STOPPED reason=bridge-ready-missing shell_pid=400 runtime_pid=401 marker_pid=401'
      );
      expect(result.stdout).toContain('selected action: fallback-start');
      expect(result.stdout).toContain('status: STARTED');
      expectFallbackStartActions(await readActions(actionLog));
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('does not treat stale RUNNING during fallback-start as a successful start', { timeout: 30000 }, async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'windows-preview-test-'));
    try {
      const { syncScript, clientScript, freshnessScript, actionLog } = await createMockScripts(
        tempRoot,
        [
          'if [ "${WINDOWS_CLIENT_ACTION}" = "status" ]; then',
          '  echo "[windows-restart-client] status: STOPPED reason=stale-runtime-detected"',
          '  exit 0',
          'fi',
          'if [ "${WINDOWS_CLIENT_ACTION}" = "start" ]; then',
          '  echo "[windows-restart-client] status: RUNNING head=old-head"',
          '  exit 0',
          'fi',
          'exit 1'
        ].join('\n')
      );

      const result = await runScript({
        ACTION_LOG: actionLog,
        WINDOWS_ELECTRON_DIST_FRESHNESS_SCRIPT: freshnessScript,
        WINDOWS_PREVIEW_TIMEOUT_START_SECONDS: '1',
        WINDOWS_SYNC_SCRIPT: syncScript,
        WINDOWS_CLIENT_SCRIPT: clientScript,
        WINDOWS_PREVIEW_CHANGED_FILES: 'src/app/App.tsx'
      });

      expect(result.code).toBe(1);
      expect(result.stdout).toContain('reason: Class C: no trusted running client (stale-runtime-detected)');
      expect(result.stdout).toContain('client status detail: status: STOPPED reason=stale-runtime-detected');
      expect(result.stdout).toContain('selected action: fallback-start');
      expect(result.stdout).toContain('fallback start failed');
      expect(result.stdout).toContain('status: RUNNING head=old-head');
      expect(result.stdout).not.toContain('[windows-preview] status: STARTED');
      expectFallbackStartActions(await readActions(actionLog));
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('treats trusted RUNNING during fallback-start as a successful start handoff', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'windows-preview-test-'));
    const startedMarker = path.join(tempRoot, 'started.flag');
    try {
      const { syncScript, clientScript, freshnessScript, actionLog } = await createMockScripts(
        tempRoot,
        [
          'if [ "${WINDOWS_CLIENT_ACTION}" = "status" ]; then',
          '  if [ -f "${STARTED_MARKER}" ]; then',
          '    echo "[windows-restart-client] status: RUNNING trust=OK shell_pid=500 runtime_pid=501 head=current-head"',
          '  else',
          '  echo "[windows-restart-client] status: STOPPED reason=no-runtime"',
          '  fi',
          '  exit 0',
          'fi',
          'if [ "${WINDOWS_CLIENT_ACTION}" = "start" ]; then',
          '  : > "${STARTED_MARKER}"',
          '  echo "[windows-restart-client] status: RUNNING trust=OK shell_pid=500 runtime_pid=501 head=current-head"',
          '  exit 0',
          'fi',
          'exit 1'
        ].join('\n')
      );

      const result = await runScript({
        ACTION_LOG: actionLog,
        STARTED_MARKER: startedMarker,
        WINDOWS_ELECTRON_DIST_FRESHNESS_SCRIPT: freshnessScript,
        WINDOWS_SYNC_SCRIPT: syncScript,
        WINDOWS_CLIENT_SCRIPT: clientScript,
        WINDOWS_PREVIEW_CURRENT_HEAD: 'current-head',
        WINDOWS_PREVIEW_CHANGED_FILES: 'src/app/App.tsx'
      });

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('reason: Class C: no trusted running client (no-runtime)');
      expect(result.stdout).toContain('selected action: fallback-start');
      expect(result.stdout).toContain('status: STARTED');
      expectFallbackStartActions(await readActions(actionLog));
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('finishes fallback-start when the start action hangs but status already reports a trusted running client', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'windows-preview-test-'));
    const startedMarker = path.join(tempRoot, 'started.flag');
    try {
      const { syncScript, clientScript, freshnessScript, actionLog } = await createMockScripts(
        tempRoot,
        [
          'if [ "${WINDOWS_CLIENT_ACTION}" = "status" ]; then',
          '  if [ -f "${STARTED_MARKER}" ]; then',
          '    echo "[windows-restart-client] status: RUNNING trust=OK shell_pid=500 runtime_pid=501 head=current-head"',
          '  else',
          '    echo "[windows-restart-client] status: STOPPED reason=no-runtime"',
          '  fi',
          '  exit 0',
          'fi',
          'if [ "${WINDOWS_CLIENT_ACTION}" = "start" ]; then',
          '  : > "${STARTED_MARKER}"',
          '  node -e \'const fs=require("node:fs"); const path=require("node:path"); const root=process.argv[1]; const now=new Date().toISOString(); for (const [file, stage, payload] of [[".windows-native-boot-ready.json","app_ready",{}],[".windows-native-bridge-ready.json","bridge_ready",{bridgeAvailable:true}],[".windows-native-window-visible.json","window_visible",{isVisible:true}]]) fs.writeFileSync(path.join(root,file), JSON.stringify({head:"current-head", payload, pid:501, session:"session-1", stage, timestamp:now})+"\\n");\' "${WINDOWS_RESTART_INTENT_ROOT}"',
          '  echo "[windows-restart-client] electron:dev shell launched with visible terminal"',
          '  sleep 10',
          '  exit 0',
          'fi',
          'exit 1'
        ].join('\n')
      );

      const result = await runScript({
        ACTION_LOG: actionLog,
        STARTED_MARKER: startedMarker,
        WINDOWS_ELECTRON_DIST_FRESHNESS_SCRIPT: freshnessScript,
        WINDOWS_SYNC_SCRIPT: syncScript,
        WINDOWS_CLIENT_SCRIPT: clientScript,
        WINDOWS_PREVIEW_CURRENT_HEAD: 'current-head',
        WINDOWS_PREVIEW_CHANGED_FILES: 'src/app/components/SearchPalette.tsx',
        WINDOWS_RESTART_INTENT_ROOT: tempRoot,
        WINDOWS_PREVIEW_TIMEOUT_START_SECONDS: '5'
      });

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('selected action: fallback-start');
      expect(result.stdout).toContain('status: STARTED');
      const actions = await readActions(actionLog);
      expect(actions.slice(0, 2)).toEqual(['status', 'start']);
      expect(actions.slice(2).every((action) => action === 'status')).toBe(true);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('chooses sync-only when electron changes are test-only files', { timeout: 30000 }, async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'windows-preview-test-'));
    try {
      const { syncScript, clientScript, freshnessScript, actionLog } = await createMockScripts(
        tempRoot,
        [
          'if [ "${WINDOWS_CLIENT_ACTION}" = "status" ]; then',
          '  echo "[windows-restart-client] status: RUNNING trust=OK"',
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
        WINDOWS_PREVIEW_CHANGED_FILES: ['electron/ipc/commands.test.ts', 'electron/database/nodeMutations.test.ts'].join('\n')
      });

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('reason: Class A: no runtime changes detected');
      expect(result.stdout).toContain('selected action: sync-only');
      expect(result.stdout).toContain('[windows-preview] status: STARTED');
      expect(result.stdout).not.toContain('[windows-sync] include electron-dist');
      expect(await readActions(actionLog)).toEqual(['status', 'status']);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('does not fall back to start after selecting restart-intent', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'windows-preview-test-'));
    try {
      const { syncScript, clientScript, freshnessScript, actionLog } = await createMockScripts(
        tempRoot,
        [
          'if [ "${WINDOWS_CLIENT_ACTION}" = "status" ]; then',
          '  echo "[windows-restart-client] status: RUNNING trust=OK"',
          '  exit 0',
          'fi',
          'if [ "${WINDOWS_CLIENT_ACTION}" = "restart" ]; then',
          '  echo "[windows-restart-client] status: RESTART_FAILED reason=runtime-not-detected"',
          '  exit 1',
          'fi',
          'exit 1'
        ].join('\n')
      );

      const result = await runScript({
        ACTION_LOG: actionLog,
        WINDOWS_ELECTRON_DIST_FRESHNESS_SCRIPT: freshnessScript,
        WINDOWS_SYNC_SCRIPT: syncScript,
        WINDOWS_CLIENT_SCRIPT: clientScript,
        WINDOWS_RESTART_INTENT_SCRIPT: path.join(tempRoot, 'missing-intent-script.mjs'),
        WINDOWS_PREVIEW_CHANGED_FILES: 'electron/main.ts'
      });

      expect(result.code).toBe(1);
      expect(result.stdout).toContain('selected action: restart-intent');
      expect(result.stdout).toContain('restart intent failed');
      expect(await readActions(actionLog)).toEqual(['status']);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('falls back to restart-intent when renderer reload delivery times out', { timeout: 60000 }, async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'windows-preview-test-'));
    const consumer = startRestartDeliveryConsumer(tempRoot);
    try {
      const { syncScript, clientScript, freshnessScript, actionLog } = await createMockScripts(
        tempRoot,
        [
          'if [ "${WINDOWS_CLIENT_ACTION}" = "status" ]; then',
          '  if [ -f "${WINDOWS_RESTART_INTENT_ROOT}/.windows-dev-restart-delivered.json" ]; then',
          '    echo "[windows-restart-client] status: RUNNING trust=OK head=$(node -e "const fs=require(\\"node:fs\\");const p=JSON.parse(fs.readFileSync(process.argv[1],\\"utf8\\"));process.stdout.write(p.head||\\"\\")" "${WINDOWS_RESTART_INTENT_ROOT}/.windows-dev-restart-delivered.json")"',
          '    exit 0',
          '  fi',
          '  echo "[windows-restart-client] status: RUNNING trust=OK head=old-head"',
          '  exit 0',
          'fi',
          'exit 1'
        ].join('\n')
      );

      const rendererReloadRoot = path.join(tempRoot, 'missing-renderer-consumer');
      const result = await runScript({
        ACTION_LOG: actionLog,
        WINDOWS_ELECTRON_DIST_FRESHNESS_SCRIPT: freshnessScript,
        WINDOWS_SYNC_SCRIPT: syncScript,
        WINDOWS_CLIENT_SCRIPT: clientScript,
        WINDOWS_PREVIEW_CURRENT_HEAD: 'old-head',
        WINDOWS_RESTART_INTENT_ROOT: tempRoot,
        WINDOWS_RENDERER_RELOAD_INTENT_ROOT: rendererReloadRoot,
        WINDOWS_PREVIEW_ALLOW_RENDERER_RELOAD: '1',
        WINDOWS_PREVIEW_CHANGED_FILES: 'src/app/components/SearchPalette.tsx',
        WINDOWS_PREVIEW_TIMEOUT_SECONDS: '1',
        WINDOWS_PREVIEW_TIMEOUT_STATUS_SECONDS: '1',
        WINDOWS_PREVIEW_TIMEOUT_RESTART_SECONDS: '3'
      });

      const restartDelivery = await readRestartDelivery(tempRoot);

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('selected action: renderer-reload-intent');
      expect(result.stdout).toContain('renderer reload delivery timed out nonce=1');
      expect(result.stdout).toContain('renderer reload delivery missing; falling back to restart-intent');
      expect(result.stdout).toContain('canceled pending renderer reload intent');
      expect(result.stdout).toContain('selected action: restart-intent');
      expect(result.stdout).toContain('restart markers updated');
      expect(result.stdout).toContain('restart status:');
      expect(result.stdout).toContain('status: STARTED');
      expect(restartDelivery).toMatchObject({
        nonce: 1,
        target: 'electron-dev'
      });
      await expect(readFile(path.join(rendererReloadRoot, RENDERER_RELOAD_INTENT_FILE), 'utf8')).rejects.toMatchObject({
        code: 'ENOENT'
      });
      expect(await readActions(actionLog)).toEqual(['status', 'status']);
    } finally {
      consumer.kill('SIGTERM');
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('falls back to direct restart when restart delivery is acknowledged but fresh ready markers never arrive', { timeout: 30000 }, async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'windows-preview-test-'));
    const consumer = spawn(
      process.execPath,
      [
        '-e',
        `
const fs = require('node:fs');
const path = require('node:path');
const rootDir = process.argv[1];
const intentFile = path.join(rootDir, '${RESTART_INTENT_FILE}');
const deliveryFile = path.join(rootDir, '${RESTART_DELIVERY_FILE}');

function writeJson(filePath, payload) {
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2) + '\\n', 'utf8');
}

const start = Date.now();
const timer = setInterval(() => {
  if (!fs.existsSync(intentFile)) {
    if (Date.now() - start > ${TEST_IDLE_TIMEOUT_MS}) {
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
    kind: 'foliole.electron.dev.restart-delivered.v1',
    nonce: payload.nonce,
    reason: payload.reason,
    requestedAt: payload.requestedAt,
    requestedBy: payload.requestedBy,
    target: payload.target
  });
  clearInterval(timer);
  process.exit(0);
}, 50);
        `,
        tempRoot
      ],
      {
        cwd: REPO_ROOT,
        stdio: 'ignore'
      }
    );

    try {
      const { syncScript, clientScript, freshnessScript, actionLog } = await createMockScripts(
        tempRoot,
        [
          'if [ "${WINDOWS_CLIENT_ACTION}" = "status" ]; then',
          '  echo "[windows-restart-client] status: RUNNING trust=OK head=old-head"',
          '  exit 0',
          'fi',
          'if [ "${WINDOWS_CLIENT_ACTION}" = "restart" ]; then',
          '  echo "[windows-restart-client] status: RESTARTED mode=runtime-only old_runtime_pid=401 runtime_pid=501 renderer_url=http://127.0.0.1:24600"',
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
        WINDOWS_PREVIEW_CHANGED_FILES: 'electron/main.ts',
        WINDOWS_PREVIEW_CURRENT_HEAD: 'old-head',
        WINDOWS_PREVIEW_TIMEOUT_RESTART_SECONDS: '5'
      });

      const restartDelivery = await readRestartDelivery(tempRoot);

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('selected action: restart-intent');
      expect(result.stdout).toContain('restart delivery acknowledged nonce=1');
      expect(result.stdout).toContain('restart markers timed out');
      expect(result.stdout).toContain('restart markers missing after intent delivery; falling back to direct restart');
      expect(result.stdout).toContain('selected action: direct-restart');
      expect(result.stdout).toContain('status: RESTARTED');
      expect(result.stdout).toContain('status: STARTED');
      expect(restartDelivery).toMatchObject({
        nonce: 1,
        target: 'electron-dev'
      });
      const actions = await readActions(actionLog);
      expect(actions[0]).toBe('status');
      expect(actions.at(-1)).toBe('restart');
      expect(actions.filter((action) => action === 'restart')).toEqual(['restart']);
    } finally {
      consumer.kill('SIGTERM');
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('completes restart-intent when trusted running status reaches the current head before fresh marker timestamps appear', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'windows-preview-test-'));
    const consumer = spawn(
      process.execPath,
      [
        '-e',
        `
const fs = require('node:fs');
const path = require('node:path');
const rootDir = process.argv[1];
const intentFile = path.join(rootDir, '${RESTART_INTENT_FILE}');
const deliveryFile = path.join(rootDir, '${RESTART_DELIVERY_FILE}');
const bootReadyFile = path.join(rootDir, '.windows-native-boot-ready.json');
const bridgeReadyFile = path.join(rootDir, '.windows-native-bridge-ready.json');

function writeJson(filePath, payload) {
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2) + '\\n', 'utf8');
}

const staleTimestamp = new Date('2026-03-14T00:00:00.000Z').toISOString();
writeJson(bootReadyFile, {
  stage: 'app_ready',
  pid: 501,
  session: 'session-1',
  timestamp: staleTimestamp
});
writeJson(bridgeReadyFile, {
  stage: 'bridge_ready',
  pid: 501,
  session: 'session-1',
  timestamp: staleTimestamp,
  payload: { bridgeAvailable: true }
});

const start = Date.now();
const timer = setInterval(() => {
  if (!fs.existsSync(intentFile)) {
    if (Date.now() - start > ${TEST_IDLE_TIMEOUT_MS}) {
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
    kind: 'foliole.electron.dev.restart-delivered.v1',
    nonce: payload.nonce,
    reason: payload.reason,
    requestedAt: payload.requestedAt,
    requestedBy: payload.requestedBy,
    target: payload.target
  });
  clearInterval(timer);
  process.exit(0);
}, 50);
        `,
        tempRoot
      ],
      {
        cwd: REPO_ROOT,
        stdio: 'ignore'
      }
    );

    try {
      const { syncScript, clientScript, freshnessScript, actionLog } = await createMockScripts(
        tempRoot,
        [
          'if [ "${WINDOWS_CLIENT_ACTION}" = "status" ]; then',
          '  if [ -f "${WINDOWS_RESTART_INTENT_ROOT}/.windows-dev-restart-delivered.json" ]; then',
          '    echo "[windows-restart-client] status: RUNNING trust=OK shell_pid=500 runtime_pid=501 head=current-head"',
          '    exit 0',
          '  fi',
          '  echo "[windows-restart-client] status: RUNNING trust=OK shell_pid=400 runtime_pid=401 head=old-head"',
          '  exit 0',
          'fi',
          'if [ "${WINDOWS_CLIENT_ACTION}" = "restart" ]; then',
          '  echo "[windows-restart-client] status: RESTARTED mode=runtime-only old_runtime_pid=401 runtime_pid=501 renderer_url=http://127.0.0.1:24600"',
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
        WINDOWS_PREVIEW_CURRENT_HEAD: 'old-head',
        WINDOWS_PREVIEW_CHANGED_FILES: 'electron/main.ts',
        WINDOWS_PREVIEW_TIMEOUT_RESTART_SECONDS: '5'
      });

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('selected action: restart-intent');
      expect(result.stdout).toContain('restart delivery acknowledged nonce=1');
      expect(result.stdout).toContain('restart markers accepted via trusted running');
      expect(result.stdout).toContain('status: STARTED');
      const actions = await readActions(actionLog);
      expect(actions).toEqual(['status', 'status', 'status']);
    } finally {
      consumer.kill('SIGTERM');
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('falls back to direct restart when restart delivery never arrives', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'windows-preview-test-'));

    try {
      const { syncScript, clientScript, freshnessScript, actionLog } = await createMockScripts(
        tempRoot,
        [
          'if [ "${WINDOWS_CLIENT_ACTION}" = "status" ]; then',
          '  echo "[windows-restart-client] status: RUNNING trust=OK head=old-head"',
          '  exit 0',
          'fi',
          'if [ "${WINDOWS_CLIENT_ACTION}" = "restart" ]; then',
          '  echo "[windows-restart-client] status: RESTARTED mode=runtime-only old_runtime_pid=401 runtime_pid=501 renderer_url=http://127.0.0.1:24600"',
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
        WINDOWS_PREVIEW_CHANGED_FILES: 'electron/main.ts',
        WINDOWS_PREVIEW_CURRENT_HEAD: 'old-head',
        WINDOWS_PREVIEW_TIMEOUT_RESTART_SECONDS: '5'
      });

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('selected action: restart-intent');
      expect(result.stdout).toContain('restart delivery timed out nonce=1');
      expect(result.stdout).toContain('restart delivery missing after intent request; falling back to direct restart');
      expect(result.stdout).toContain('selected action: direct-restart');
      expect(result.stdout).toContain('status: RESTARTED');
      expect(result.stdout).toContain('status: STARTED');
      expect(await readActions(actionLog)).toEqual(['status', 'restart']);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('does not use fallback-start when client status is unavailable', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'windows-preview-test-'));
    try {
      const { syncScript, clientScript, freshnessScript, actionLog } = await createMockScripts(
        tempRoot,
        ['if [ "${WINDOWS_CLIENT_ACTION}" = "status" ]; then', '  exit 1', 'fi', 'exit 1'].join('\n')
      );

      const result = await runScript({
        ACTION_LOG: actionLog,
        WINDOWS_ELECTRON_DIST_FRESHNESS_SCRIPT: freshnessScript,
        WINDOWS_SYNC_SCRIPT: syncScript,
        WINDOWS_CLIENT_SCRIPT: clientScript,
        WINDOWS_PREVIEW_CHANGED_FILES: 'src/app/App.tsx'
      });

      expect(result.code).toBe(1);
      expect(result.stdout).toContain('reason: Class C: client status unavailable');
      expect(result.stdout).toContain('selected action: status-probe-failed');
      expect(result.stdout).toContain('status probe failed');
      expect(await readActions(actionLog)).toEqual(['status']);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });
});
