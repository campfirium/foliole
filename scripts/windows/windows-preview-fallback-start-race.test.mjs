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
const WRITE_FRESH_MARKERS = [
  'node -e \'',
  'const fs=require("node:fs");',
  'const path=require("node:path");',
  'const root=process.argv[1];',
  'const now=new Date().toISOString();',
  'for (const [file, stage, payload] of [[".windows-native-boot-ready.json","app_ready",{}],[".windows-native-bridge-ready.json","bridge_ready",{bridgeAvailable:true}],[".windows-native-window-visible.json","window_visible",{isVisible:true}]])',
  'fs.writeFileSync(path.join(root,file), JSON.stringify({head:"current-head", payload, pid:501, session:"session-1", stage, timestamp:now})+"\\n");',
  '\' "${WINDOWS_RESTART_INTENT_ROOT}"'
].join(' ');

function runPreview(env) {
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

async function writeMockScripts(root, clientBody) {
  const actionLog = path.join(root, 'actions.log');
  const clientScript = path.join(root, 'mock-client.sh');
  const freshnessScript = path.join(root, 'mock-freshness.mjs');
  const syncScript = path.join(root, 'mock-sync.sh');
  await writeFile(actionLog, '', 'utf8');
  await writeFile(freshnessScript, 'process.stdout.write("[check-electron-dist-fresh] status: FRESH\\n");\n', 'utf8');
  await writeFile(syncScript, 'echo "[windows-sync] status: SYNCED"\n', 'utf8');
  await writeFile(
    clientScript,
    ['#!/usr/bin/env bash', 'set -euo pipefail', 'echo "${WINDOWS_CLIENT_ACTION}" >> "${ACTION_LOG}"', clientBody].join('\n'),
    'utf8'
  );
  return { actionLog, clientScript, freshnessScript, syncScript };
}

async function readActions(actionLog) {
  return (await readFile(actionLog, 'utf8')).trim().split('\n').filter(Boolean);
}

describe('windows preview fallback start race', () => {
  it('accepts trusted status after an early START_FAILED start response', { timeout: 10000 }, async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'windows-preview-race-'));
    const startedMarker = path.join(tempRoot, 'started.flag');
    try {
      const { actionLog, clientScript, freshnessScript, syncScript } = await writeMockScripts(
        tempRoot,
        [
          'if [ "${WINDOWS_CLIENT_ACTION}" = "status" ]; then',
          '  if [ -f "${STARTED_MARKER}" ]; then',
          '    echo "[windows-restart-client] status: RUNNING trust=OK runtime_pid=501 head=current-head"',
          '  else',
          '    echo "[windows-restart-client] status: STOPPED reason=no-runtime"',
          '  fi',
          '  exit 0',
          'fi',
          'if [ "${WINDOWS_CLIENT_ACTION}" = "start" ]; then',
          '  : > "${STARTED_MARKER}"',
          `  ${WRITE_FRESH_MARKERS}`,
          '  echo "[windows-restart-client] status: START_FAILED reason=start-health-race"',
          '  exit 1',
          'fi',
          'exit 1'
        ].join('\n')
      );

      const result = await runPreview({
        ACTION_LOG: actionLog,
        STARTED_MARKER: startedMarker,
        WINDOWS_CLIENT_SCRIPT: clientScript,
        WINDOWS_ELECTRON_DIST_FRESHNESS_SCRIPT: freshnessScript,
        WINDOWS_PREVIEW_CHANGED_FILES: 'src/app/App.tsx',
        WINDOWS_PREVIEW_CURRENT_HEAD: 'current-head',
        WINDOWS_RESTART_INTENT_ROOT: tempRoot,
        WINDOWS_SYNC_SCRIPT: syncScript
      });

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('selected action: fallback-start');
      expect(result.stdout).toMatch(/fallback start (?:recovery )?status:/u);
      expect(result.stdout).toContain('status: STARTED');
      const actions = await readActions(actionLog);
      expect(actions.slice(0, 3)).toEqual(['status', 'start', 'status']);
      expect(actions.slice(3).every((action) => action === 'status')).toBe(true);
    } finally {
      await rm(tempRoot, { force: true, recursive: true });
    }
  });

  it('does not accept a hanging start with only stale trusted status', { timeout: 20000 }, async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'windows-preview-race-'));
    const startedMarker = path.join(tempRoot, 'started.flag');
    try {
      const { actionLog, clientScript, freshnessScript, syncScript } = await writeMockScripts(
        tempRoot,
        [
          'if [ "${WINDOWS_CLIENT_ACTION}" = "status" ]; then',
          '  if [ -f "${STARTED_MARKER}" ]; then',
          '    echo "[windows-restart-client] status: RUNNING trust=OK runtime_pid=501 head=current-head"',
          '  else',
          '    echo "[windows-restart-client] status: STOPPED reason=no-runtime"',
          '  fi',
          '  exit 0',
          'fi',
          'if [ "${WINDOWS_CLIENT_ACTION}" = "start" ]; then',
          '  : > "${STARTED_MARKER}"',
          '  echo "[windows-restart-client] electron:dev shell launched with visible terminal"',
          '  sleep 10',
          '  exit 0',
          'fi',
          'exit 1'
        ].join('\n')
      );

      const result = await runPreview({
        ACTION_LOG: actionLog,
        STARTED_MARKER: startedMarker,
        WINDOWS_CLIENT_SCRIPT: clientScript,
        WINDOWS_ELECTRON_DIST_FRESHNESS_SCRIPT: freshnessScript,
        WINDOWS_PREVIEW_CHANGED_FILES: 'src/app/App.tsx',
        WINDOWS_PREVIEW_CURRENT_HEAD: 'current-head',
        WINDOWS_PREVIEW_TIMEOUT_START_SECONDS: '3',
        WINDOWS_RESTART_INTENT_ROOT: tempRoot,
        WINDOWS_SYNC_SCRIPT: syncScript
      });

      expect(result.code).toBe(1);
      expect(result.stdout).toContain('selected action: fallback-start');
      expect(result.stdout).toContain('fallback start failed');
      expect(result.stdout).not.toContain('[windows-preview] status: STARTED');
    } finally {
      await rm(tempRoot, { force: true, recursive: true });
    }
  });
});
