#!/usr/bin/env node
/* global console, process */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const RUNTIME_DIR = path.join(REPO_ROOT, '.lab/internal/runtime');
const STATE_PATH = path.join(RUNTIME_DIR, 'windows-sync-watch.state.json');
const LOG_PATH = path.join(RUNTIME_DIR, 'windows-sync-watch.log');

function readState(statePath = STATE_PATH) {
  try {
    return JSON.parse(fs.readFileSync(statePath, 'utf8'));
  } catch {
    return null;
  }
}

function writeState(state, statePath = STATE_PATH) {
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

export function isProcessAlive(pid, kill = process.kill) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try {
    kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function describeState(state, kill = process.kill) {
  if (!state?.pid) {
    return { running: false, reason: 'missing-state' };
  }
  if (!isProcessAlive(Number(state.pid), kill)) {
    return { pid: state.pid, running: false, reason: 'dead-pid' };
  }
  return {
    logPath: state.logPath,
    mirrorDir: state.mirrorDir,
    pid: state.pid,
    running: true,
    startedAt: state.startedAt
  };
}

function startWatcher() {
  fs.mkdirSync(RUNTIME_DIR, { recursive: true });
  const logFd = fs.openSync(LOG_PATH, 'a');
  const child = spawn(process.execPath, ['scripts/windows/windows-sync-watch.mjs'], {
    cwd: REPO_ROOT,
    detached: true,
    env: {
      ...process.env,
      WINDOWS_SYNC_WATCH_MANAGED: '1'
    },
    stdio: ['ignore', logFd, logFd]
  });
  child.unref();
  const state = {
    logPath: LOG_PATH,
    mirrorDir: process.env.WINDOWS_MIRROR_DIR || '/mnt/d/C/foliole',
    pid: child.pid,
    repoRoot: REPO_ROOT,
    startedAt: new Date().toISOString()
  };
  writeState(state);
  return state;
}

function ensureWatcher() {
  const current = describeState(readState());
  if (current.running) {
    console.log(`[windows-sync-watch-manager] status: RUNNING pid=${current.pid} log=${current.logPath}`);
    return 0;
  }
  const state = startWatcher();
  console.log(`[windows-sync-watch-manager] status: STARTED pid=${state.pid} log=${state.logPath}`);
  return 0;
}

function statusWatcher() {
  const status = describeState(readState());
  if (status.running) {
    console.log(`[windows-sync-watch-manager] status: RUNNING pid=${status.pid} log=${status.logPath}`);
    return 0;
  }
  console.log(`[windows-sync-watch-manager] status: STOPPED reason=${status.reason}`);
  return 1;
}

function stopWatcher() {
  const state = readState();
  const status = describeState(state);
  if (!status.running) {
    console.log(`[windows-sync-watch-manager] status: STOPPED reason=${status.reason}`);
    return 0;
  }
  process.kill(Number(state.pid), 'SIGTERM');
  console.log(`[windows-sync-watch-manager] status: STOP_REQUESTED pid=${state.pid}`);
  return 0;
}

function main() {
  const action = process.argv[2] || 'ensure';
  if (action === 'ensure' || action === 'start') return ensureWatcher();
  if (action === 'status') return statusWatcher();
  if (action === 'stop') return stopWatcher();
  console.error('Usage: node scripts/windows/windows-sync-watch-manager.mjs <ensure|start|status|stop>');
  return 2;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main();
}
