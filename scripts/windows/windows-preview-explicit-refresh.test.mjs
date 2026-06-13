// @vitest-environment node
/* global process */

import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, it } from 'vitest';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PREVIEW_SCRIPT = path.join(REPO_ROOT, 'scripts', 'windows', 'windows-preview.sh');
const RENDERER_RELOAD_INTENT_FILE = '.windows-dev-renderer-reload-intent.json';
const RENDERER_RELOAD_DELIVERY_FILE = '.windows-dev-renderer-reload-delivered.json';

function runScript(env) {
  return new Promise((resolve) => {
    const child = spawn('bash', [PREVIEW_SCRIPT], {
      cwd: REPO_ROOT,
      env: {
        ...process.env,
        WINDOWS_NATIVE_ABI_CHECK_COMMAND: 'true',
        WINDOWS_NODE_MODULES_CHECK_COMMAND: 'true',
        WINDOWS_PREVIEW_TIMEOUT_SECONDS: '2',
        WINDOWS_PREVIEW_TIMEOUT_STATUS_SECONDS: '2',
        WINDOWS_PREVIEW_TIMEOUT_START_SECONDS: '3',
        WINDOWS_PREVIEW_TIMEOUT_RESTART_SECONDS: '3',
        WINDOWS_STARTUP_DIAGNOSTICS_SCRIPT: path.join(os.tmpdir(), 'missing-windows-startup-diagnostics.mjs'),
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

async function createMockScripts(root) {
  const syncScript = path.join(root, 'mock-sync.sh');
  const clientScript = path.join(root, 'mock-client.sh');
  const freshnessScript = path.join(root, 'mock-freshness.mjs');
  const actionLog = path.join(root, 'actions.log');
  await writeFile(syncScript, '#!/usr/bin/env bash\necho "[windows-sync] status: SYNCED"\n', 'utf8');
  await writeFile(
    clientScript,
    [
      '#!/usr/bin/env bash',
      'set -euo pipefail',
      'echo "${WINDOWS_CLIENT_ACTION}" >> "${ACTION_LOG}"',
      'if [ "${WINDOWS_CLIENT_ACTION}" = "status" ]; then',
      '  echo "[windows-restart-client] status: RUNNING trust=OK"',
      '  exit 0',
      'fi',
      'exit 1'
    ].join('\n'),
    'utf8'
  );
  await writeFile(freshnessScript, 'process.stdout.write("[check-electron-dist-fresh] status: FRESH\\n");\n', 'utf8');
  await writeFile(actionLog, '', 'utf8');
  return { actionLog, clientScript, freshnessScript, syncScript };
}

function startRendererReloadConsumer(rootDir) {
  const script = `
const fs = require('node:fs');
const path = require('node:path');
const rootDir = process.argv[1];
const intentFile = path.join(rootDir, '${RENDERER_RELOAD_INTENT_FILE}');
const deliveryFile = path.join(rootDir, '${RENDERER_RELOAD_DELIVERY_FILE}');
const bootReadyFile = path.join(rootDir, '.windows-native-boot-ready.json');
const bridgeReadyFile = path.join(rootDir, '.windows-native-bridge-ready.json');
const start = Date.now();
const timer = setInterval(() => {
  if (!fs.existsSync(intentFile)) {
    if (Date.now() - start > 25000) {
      clearInterval(timer);
      process.exit(0);
    }
    return;
  }
  const payload = JSON.parse(fs.readFileSync(intentFile, 'utf8'));
  fs.unlinkSync(intentFile);
  fs.writeFileSync(deliveryFile, JSON.stringify({
    kind: 'foliole.electron.dev.renderer-reload-delivered.v1',
    nonce: payload.nonce,
    requestedAt: payload.requestedAt
  }) + '\\n', 'utf8');
  fs.writeFileSync(bootReadyFile, JSON.stringify({
    head: payload.head ?? null,
    pid: 501,
    stage: 'app_ready',
    timestamp: new Date(Date.parse(payload.requestedAt) + 1000).toISOString()
  }) + '\\n', 'utf8');
  fs.writeFileSync(bridgeReadyFile, JSON.stringify({
    head: payload.head ?? null,
    pid: 501,
    stage: 'bridge_ready',
    timestamp: new Date(Date.parse(payload.requestedAt) + 2000).toISOString()
  }) + '\\n', 'utf8');
  clearInterval(timer);
  process.exit(0);
}, 50);
`;
  return spawn(process.execPath, ['-e', script, rootDir], { stdio: 'ignore' });
}

async function readActions(actionLog) {
  return (await readFile(actionLog, 'utf8')).trim().split('\n').filter(Boolean);
}

it('chooses renderer reload for an explicit preview refresh without file changes', { timeout: 30000 }, async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'windows-preview-explicit-refresh-'));
  const consumer = startRendererReloadConsumer(tempRoot);
  try {
    const { actionLog, clientScript, freshnessScript, syncScript } = await createMockScripts(tempRoot);
    const result = await runScript({
      ACTION_LOG: actionLog,
      WINDOWS_CLIENT_SCRIPT: clientScript,
      WINDOWS_ELECTRON_DIST_FRESHNESS_SCRIPT: freshnessScript,
      WINDOWS_PREVIEW_CHANGED_FILES: '',
      WINDOWS_PREVIEW_REQUIRE_REFRESH: '1',
      WINDOWS_RENDERER_RELOAD_INTENT_ROOT: tempRoot,
      WINDOWS_RESTART_INTENT_ROOT: tempRoot,
      WINDOWS_SYNC_SCRIPT: syncScript
    });

    expect(result.code, `${result.stdout}\n${result.stderr}`).toBe(0);
    expect(result.stdout).toContain('reason: Class A: explicit preview refresh requested');
    expect(result.stdout).toContain('selected action: renderer-reload-intent');
    expect(result.stdout).toContain('windows-renderer-reload-intent] status: REQUESTED nonce=1');
    expect(result.stdout).toContain('[windows-preview] status: STARTED');
    const delivery = JSON.parse(await readFile(path.join(tempRoot, RENDERER_RELOAD_DELIVERY_FILE), 'utf8'));
    expect(delivery).toMatchObject({
      kind: 'foliole.electron.dev.renderer-reload-delivered.v1',
      nonce: 1
    });
    expect(await readActions(actionLog)).toEqual(['status', 'status']);
  } finally {
    consumer.kill('SIGTERM');
    await rm(tempRoot, { force: true, recursive: true });
  }
});
