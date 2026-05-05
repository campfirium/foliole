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

  return { actionLog, clientScript, compileScript, freshnessScript, syncScript };
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

describe('windows-preview script', { timeout: 15000 }, () => {
  it('rebuilds stale electron-dist before sync instead of failing early', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'windows-preview-test-'));
    const consumer = startIntentConsumer(tempRoot, 'renderer-reload');
    try {
      const { syncScript, clientScript, compileScript, freshnessScript, actionLog } = await createMockScripts(
        tempRoot,
        ['if [ "${WINDOWS_CLIENT_ACTION}" = "status" ]; then', '  echo "[windows-restart-client] status: RUNNING"', '  exit 0', 'fi', 'exit 1'].join('\n')
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
        WINDOWS_PREVIEW_CHANGED_FILES: 'src/app/App.tsx'
      });

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('step 1/3: verify electron-dist freshness');
      expect(result.stdout).toContain('electron-dist stale; compiling runtime bundle');
      expect(result.stdout).toContain('[mock-electron-compile] status: COMPILED');
      expect(result.stdout).toContain('[windows-sync] status: SYNCED');
      expect(result.stdout).toContain('status: DELIVERED');
      expect(await readActions(actionLog)).toEqual(['status', 'status']);
    } finally {
      consumer.kill('SIGTERM');
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('chooses renderer reload intent for Class A on a trusted running client', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'windows-preview-test-'));
    const consumer = startIntentConsumer(tempRoot, 'renderer-reload');
    try {
      const { syncScript, clientScript, freshnessScript, actionLog } = await createMockScripts(
        tempRoot,
        ['if [ "${WINDOWS_CLIENT_ACTION}" = "status" ]; then', '  echo "[windows-restart-client] status: RUNNING"', '  exit 0', 'fi', 'exit 1'].join('\n')
      );

      const result = await runScript({
        ACTION_LOG: actionLog,
        WINDOWS_ELECTRON_DIST_FRESHNESS_SCRIPT: freshnessScript,
        WINDOWS_SYNC_SCRIPT: syncScript,
        WINDOWS_CLIENT_SCRIPT: clientScript,
        WINDOWS_RESTART_INTENT_ROOT: tempRoot,
        WINDOWS_PREVIEW_CHANGED_FILES: 'src/app/App.tsx'
      });
      const rendererReloadDelivery = await readRendererReloadDelivery(tempRoot);
      expect(result.code).toBe(0);
      expect(result.stdout).toContain('reason: Class A: renderer-only sync path');
      expect(result.stdout).toContain('selected action: renderer-reload-intent');
      expect(result.stdout).toContain('windows-renderer-reload-intent] status: REQUESTED nonce=1');
      expect(result.stdout).toContain('renderer reload delivery acknowledged nonce=1');
      expect(result.stdout).toContain('status: DELIVERED');
      expect(rendererReloadDelivery).toMatchObject({
        nonce: 1,
        requestedBy: 'wsl-windows-preview',
        target: 'electron-dev-renderer',
        reason: 'Class A: renderer-only sync path'
      });
      expect(await readActions(actionLog)).toEqual(['status', 'status']);
    } finally {
      consumer.kill('SIGTERM');
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('chooses restart-intent for Class B working tree electron changes', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'windows-preview-test-'));
    const consumer = startIntentConsumer(tempRoot, 'restart');
    try {
      const { syncScript, clientScript, freshnessScript, actionLog } = await createMockScripts(
        tempRoot,
        [
          'if [ "${WINDOWS_CLIENT_ACTION}" = "status" ]; then',
          '  if [ -f "${WINDOWS_RESTART_INTENT_ROOT}/.windows-dev-restart-delivered.json" ]; then',
          '    echo "[windows-restart-client] status: RUNNING head=$(node -e "const fs=require(\\"node:fs\\");const p=JSON.parse(fs.readFileSync(process.argv[1],\\"utf8\\"));process.stdout.write(p.head||\\"\\")" "${WINDOWS_RESTART_INTENT_ROOT}/.windows-dev-restart-delivered.json")"',
          '    exit 0',
          '  fi',
          '  echo "[windows-restart-client] status: RUNNING head=old-head"',
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

      const restartDelivery = await readRestartDelivery(tempRoot);

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('reason: Class B: working tree electron changes detected');
      expect(result.stdout).toContain('[windows-sync] include electron-dist');
      expect(result.stdout).toContain('selected action: restart-intent');
      expect(result.stdout).toContain('status: REQUESTED nonce=1');
      expect(result.stdout).toContain('restart delivery acknowledged nonce=1');
      expect(result.stdout).toContain('restart markers updated');
      expect(result.stdout).toContain('status: RESTARTED');
      expect(restartDelivery).toMatchObject({
        nonce: 1,
        requestedBy: 'wsl-windows-preview',
        target: 'electron-dev',
        reason: 'Class B: working tree electron changes detected'
      });
      expect(await readActions(actionLog)).toEqual(['status', 'status']);
    } finally {
      consumer.kill('SIGTERM');
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('chooses restart-intent when runtime head is behind committed electron changes', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'windows-preview-test-'));
    const consumer = startIntentConsumer(tempRoot, 'restart');
    try {
      const { syncScript, clientScript, freshnessScript, actionLog } = await createMockScripts(
        tempRoot,
        [
          'if [ "${WINDOWS_CLIENT_ACTION}" = "status" ]; then',
          '  if [ -f "${WINDOWS_RESTART_INTENT_ROOT}/.windows-dev-restart-delivered.json" ]; then',
          '    echo "[windows-restart-client] status: RUNNING head=new-head"',
          '    exit 0',
          '  fi',
          '  echo "[windows-restart-client] status: RUNNING head=old-head"',
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
        WINDOWS_PREVIEW_CHANGED_FILES: 'src/app/App.tsx',
        WINDOWS_PREVIEW_CURRENT_HEAD: 'new-head',
        WINDOWS_PREVIEW_COMMITTED_ELECTRON_CHANGES: 'electron/main.ts'
      });

      const restartDelivery = await readRestartDelivery(tempRoot);

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('reason: Class B: runtime behind committed electron changes');
      expect(result.stdout).toContain('selected action: restart-intent');
      expect(result.stdout).toContain('status: REQUESTED nonce=1');
      expect(result.stdout).toContain('restart delivery acknowledged nonce=1');
      expect(result.stdout).toContain('status: RESTARTED');
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
    try {
      const { syncScript, clientScript, freshnessScript, actionLog } = await createMockScripts(
        tempRoot,
        [
          'if [ "${WINDOWS_CLIENT_ACTION}" = "status" ]; then',
          '  echo "[windows-restart-client] status: STOPPED reason=stale-runtime-detected"',
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
        WINDOWS_PREVIEW_CHANGED_FILES: 'src/app/App.tsx'
      });

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('reason: Class C: no trusted running client (stale-runtime-detected)');
      expect(result.stdout).toContain('client status detail: status: STOPPED reason=stale-runtime-detected');
      expect(result.stdout).toContain('selected action: fallback-start');
      expect(result.stdout).toContain('status: STARTED');
      expect(await readActions(actionLog)).toEqual(['status', 'start']);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('treats bridge-missing status as an untrusted visible window and forces a clean start path', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'windows-preview-test-'));
    try {
      const { syncScript, clientScript, freshnessScript, actionLog } = await createMockScripts(
        tempRoot,
        [
          'if [ "${WINDOWS_CLIENT_ACTION}" = "status" ]; then',
          '  echo "[windows-restart-client] status: STOPPED reason=bridge-ready-missing shell_pid=400 runtime_pid=401 marker_pid=401"',
          '  exit 0',
          'fi',
          'if [ "${WINDOWS_CLIENT_ACTION}" = "start" ]; then',
          '  echo "[windows-restart-client] discarded untrusted runtime pid=401 reason=bridge-ready-missing marker_pid=401"',
          '  echo "[windows-restart-client] status: STARTED shell_pid=500 runtime_pid=501"',
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
        WINDOWS_PREVIEW_CHANGED_FILES: 'src/app/App.tsx'
      });

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('reason: Class C: no trusted running client (bridge-ready-missing)');
      expect(result.stdout).toContain(
        'client status detail: status: STOPPED reason=bridge-ready-missing shell_pid=400 runtime_pid=401 marker_pid=401'
      );
      expect(result.stdout).toContain('selected action: fallback-start');
      expect(result.stdout).toContain('status: STARTED');
      expect(await readActions(actionLog)).toEqual(['status', 'start']);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('does not treat stale RUNNING during fallback-start as a successful start', async () => {
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
      expect(await readActions(actionLog)).toEqual(['status', 'start']);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('chooses renderer reload intent when electron changes are test-only files', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'windows-preview-test-'));
    const consumer = startIntentConsumer(tempRoot, 'renderer-reload');
    try {
      const { syncScript, clientScript, freshnessScript, actionLog } = await createMockScripts(
        tempRoot,
        [
          'if [ "${WINDOWS_CLIENT_ACTION}" = "status" ]; then',
          '  echo "[windows-restart-client] status: RUNNING"',
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
      const rendererReloadDelivery = await readRendererReloadDelivery(tempRoot);

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('reason: Class A: renderer-only sync path');
      expect(result.stdout).toContain('selected action: renderer-reload-intent');
      expect(result.stdout).toContain('windows-renderer-reload-intent] status: REQUESTED nonce=1');
      expect(result.stdout).toContain('status: DELIVERED');
      expect(result.stdout).not.toContain('[windows-sync] include electron-dist');
      expect(rendererReloadDelivery).toMatchObject({
        nonce: 1,
        target: 'electron-dev-renderer',
        reason: 'Class A: renderer-only sync path'
      });
      expect(await readActions(actionLog)).toEqual(['status', 'status']);
    } finally {
      consumer.kill('SIGTERM');
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
          '  echo "[windows-restart-client] status: RUNNING"',
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
