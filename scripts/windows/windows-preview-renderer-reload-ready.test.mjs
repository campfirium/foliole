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
const WINDOWS_PREVIEW_INTEGRATION_TIMEOUT_MS = 30_000;

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
        WINDOWS_PREVIEW_TIMEOUT_START_SECONDS: '4',
        WINDOWS_PREVIEW_TIMEOUT_RESTART_SECONDS: '4',
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

async function writeMockScripts(root) {
  const syncScript = path.join(root, 'mock-sync.sh');
  const clientScript = path.join(root, 'mock-client.sh');
  const freshnessScript = path.join(root, 'mock-freshness.mjs');
  const actionLog = path.join(root, 'actions.log');

  await writeFile(syncScript, 'echo "[windows-sync] status: SYNCED"\n', 'utf8');
  await writeFile(
    clientScript,
    [
      '#!/usr/bin/env bash',
      'set -euo pipefail',
      'echo "${WINDOWS_CLIENT_ACTION}" >> "${ACTION_LOG}"',
      'if [ "${WINDOWS_CLIENT_ACTION}" = "status" ]; then',
      '  echo "[windows-restart-client] status: RUNNING trust=OK head=current-head"',
      '  exit 0',
      'fi',
      'if [ "${WINDOWS_CLIENT_ACTION}" = "full-restart" ]; then',
      '  echo "[windows-restart-client] status: RESTARTED mode=full-shell-restart shell_pid=101 runtime_pid=202"',
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

async function readActions(actionLog) {
  return (await readFile(actionLog, 'utf8')).split('\n').filter(Boolean);
}

function startRendererReloadDeliveryOnlyConsumer(rootDir) {
  const script = `
const fs = require('node:fs');
const path = require('node:path');
const rootDir = process.argv[1];
const intentFile = path.join(rootDir, '.windows-dev-renderer-reload-intent.json');
const deliveryFile = path.join(rootDir, '.windows-dev-renderer-reload-delivered.json');
const start = Date.now();
const timer = setInterval(() => {
  if (!fs.existsSync(intentFile)) {
    if (Date.now() - start > 5000) process.exit(0);
    return;
  }
  const payload = JSON.parse(fs.readFileSync(intentFile, 'utf8'));
  fs.unlinkSync(intentFile);
  fs.writeFileSync(deliveryFile, JSON.stringify({
    nonce: payload.nonce,
    requestedAt: payload.requestedAt,
    requestedBy: payload.requestedBy,
    reason: payload.reason,
    target: payload.target
  }) + '\\n', 'utf8');
  clearInterval(timer);
  process.exit(0);
}, 50);
`;
  return spawn(process.execPath, ['-e', script, rootDir], { cwd: REPO_ROOT, stdio: 'ignore' });
}

it('falls back to full restart when renderer reload never reaches app ready', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'windows-preview-renderer-ready-'));
  const consumer = startRendererReloadDeliveryOnlyConsumer(tempRoot);
  try {
    const { actionLog, clientScript, freshnessScript, syncScript } = await writeMockScripts(tempRoot);

    const result = await runScript({
      ACTION_LOG: actionLog,
      WINDOWS_CLIENT_SCRIPT: clientScript,
      WINDOWS_ELECTRON_DIST_FRESHNESS_SCRIPT: freshnessScript,
      WINDOWS_PREVIEW_CHANGED_FILES: 'src/features/editor/model/liveMarkdownViewportPlans.ts',
      WINDOWS_PREVIEW_CURRENT_HEAD: 'current-head',
      WINDOWS_RENDERER_RELOAD_INTENT_ROOT: tempRoot,
      WINDOWS_RESTART_INTENT_ROOT: tempRoot,
      WINDOWS_SYNC_SCRIPT: syncScript
    });

    expect(result.code).toBe(0);
    expect(result.stdout).toContain('renderer reload did not reach app_ready; falling back to full-restart');
    expect(result.stdout).toContain('selected action: full-restart');
    expect(result.stdout).toContain('status: STARTED');
    expect(await readActions(actionLog)).toEqual(['status', 'full-restart']);
  } finally {
    consumer.kill('SIGTERM');
    await rm(tempRoot, { recursive: true, force: true });
  }
}, WINDOWS_PREVIEW_INTEGRATION_TIMEOUT_MS);
