/* global console, process, setTimeout */

import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { processAlive } from './windows-process-alive.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SERVICE = { host: '127.0.0.1', port: 24604, readyPath: '/' };

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const readyUrl = () => `http://${SERVICE.host}:${SERVICE.port}${SERVICE.readyPath}`;
const defaultStateRoot = () => process.env.FOLIOLE_WINDOWS_ANDROID_DEV_SERVER_STATE_ROOT ||
  path.join(repoRoot, '.tmp', 'windows-android-dev-server');

function servicePaths(root = defaultStateRoot(), workspace = repoRoot) {
  return {
    appState: path.join(root, 'a5-runtime.json'),
    errLog: path.join(root, 'companion.err.log'),
    installState: path.join(workspace, '.foliole-android-lab-deployment.json'),
    outLog: path.join(root, 'companion.out.log'),
    state: path.join(root, 'companion.json')
  };
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function readState(root = defaultStateRoot()) {
  return readJson(servicePaths(root).state);
}

function probeHttp(url, timeoutMs = 3000) {
  return new Promise((resolve) => {
    const request = http.get(url, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => resolve(response.statusCode === 200 && body.includes('/@vite/client')));
    });
    request.on('error', () => resolve(false));
    request.setTimeout(timeoutMs, () => { request.destroy(); resolve(false); });
  });
}

async function waitUntilReady(url, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await probeHttp(url)) return true;
    await wait(300);
  }
  return false;
}

async function currentHead(root = repoRoot) {
  if (process.env.FOLIOLE_RUNTIME_HEAD) return process.env.FOLIOLE_RUNTIME_HEAD.trim();
  const result = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() : '';
}

function headState(runtimeHead, checkoutHead) {
  if (!runtimeHead) return 'missing';
  if (!checkoutHead) return 'unknown';
  return runtimeHead === checkoutHead ? 'current' : 'stale';
}

export function createAndroidDevServerLaunch({
  nodePath = process.execPath,
  root = repoRoot,
  stateDirectory = defaultStateRoot()
} = {}) {
  const paths = servicePaths(stateDirectory);
  const env = { ...process.env, FOLIOLE_VITE_PORT: String(SERVICE.port) };
  return {
    args: ['node_modules/vite/bin/vite.js', '--config', 'vite.companion.config.ts', '--host', SERVICE.host],
    command: nodePath,
    paths,
    readyUrl: readyUrl(),
    spawnOptions: { cwd: root, detached: true, env, shell: false, windowsHide: true }
  };
}

export async function readAndroidDevServerStatus({
  root = repoRoot,
  stateDirectory = defaultStateRoot(),
  workspaceDeployment = servicePaths(stateDirectory, root).installState
} = {}) {
  const paths = servicePaths(stateDirectory, root);
  const state = readState(stateDirectory);
  const appState = readJson(paths.appState);
  const install = readJson(workspaceDeployment);
  const checkoutHead = await currentHead(root);
  const alive = processAlive(state?.pid);
  const ready = alive ? await probeHttp(readyUrl()) : false;
  const installedApkHead = install?.commitSha ?? appState?.installedApkHead ?? null;
  return {
    alive,
    appLaunchResult: appState?.appLaunchResult ?? null,
    checkoutHead,
    devServerHead: state?.devServerHead ?? null,
    devServerState: ready ? headState(state?.devServerHead, checkoutHead) : alive ? 'starting_or_stale' : 'stopped',
    installedApkHead,
    installedApkState: headState(installedApkHead, checkoutHead),
    pid: state?.pid ?? null,
    ready,
    reverseStatus: appState?.reverseStatus ?? null,
    runningMode: ready ? 'a5-dev-server' : 'stopped',
    stateDirectory,
    url: readyUrl()
  };
}

async function stopService() {
  const state = readState();
  if (!state?.pid || !processAlive(state.pid)) {
    console.log('[windows-android-dev-server] status: STOPPED');
    return;
  }
  if (process.platform === 'win32') {
    spawnSync('taskkill.exe', ['/PID', String(state.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
  } else {
    process.kill(state.pid, 'SIGTERM');
  }
  console.log(`[windows-android-dev-server] status: STOPPED pid=${state.pid}`);
}

async function startService() {
  const current = await readAndroidDevServerStatus();
  if (current.alive && current.ready) {
    console.log(`[windows-android-dev-server] status: RUNNING pid=${current.pid} url=${readyUrl()}`);
    return;
  }
  if (current.alive) await stopService();
  const launch = createAndroidDevServerLaunch();
  fs.mkdirSync(path.dirname(launch.paths.outLog), { recursive: true });
  const out = fs.openSync(launch.paths.outLog, 'a');
  const err = fs.openSync(launch.paths.errLog, 'a');
  const child = spawn(launch.command, launch.args, { ...launch.spawnOptions, stdio: ['ignore', out, err] });
  child.unref();
  fs.writeFileSync(launch.paths.state, `${JSON.stringify({
    args: launch.args,
    command: launch.command,
    devServerHead: await currentHead(launch.spawnOptions.cwd),
    errLog: launch.paths.errLog,
    outLog: launch.paths.outLog,
    pid: child.pid,
    readyUrl: launch.readyUrl,
    startedAt: new Date().toISOString()
  }, null, 2)}\n`);
  if (!(await waitUntilReady(launch.readyUrl))) {
    throw new Error(`companion did not become ready at ${launch.readyUrl}; logs=${launch.paths.outLog}`);
  }
  console.log(`[windows-android-dev-server] status: STARTED pid=${child.pid} url=${launch.readyUrl}`);
}

async function printStatus() {
  const status = await readAndroidDevServerStatus();
  const label = status.ready ? 'RUNNING' : status.alive ? 'STARTING_OR_STALE' : 'STOPPED';
  console.log(
    `[windows-android-dev-server] status: ${label} pid=${status.pid ?? '-'} url=${readyUrl()}` +
    ` checkout_head=${status.checkoutHead || '-'} dev_server_head=${status.devServerHead || '-'}` +
    ` dev_server_state=${status.devServerState} installed_apk_head=${status.installedApkHead || '-'}` +
    ` installed_apk_state=${status.installedApkState} reverse=${status.reverseStatus || 'unknown'}` +
    ` app_launch=${status.appLaunchResult || 'unknown'}`
  );
}

function printLogs() {
  const paths = servicePaths();
  console.log(`[windows-android-dev-server] stdout=${paths.outLog}`);
  console.log(`[windows-android-dev-server] stderr=${paths.errLog}`);
}

export async function runAndroidDevServerCli(argv = process.argv.slice(2)) {
  const [action = 'status'] = argv;
  if (action === 'start') return startService();
  if (action === 'stop') return stopService();
  if (action === 'restart') { await stopService(); return startService(); }
  if (action === 'status') return printStatus();
  if (action === 'logs') return printLogs();
  throw new Error(`unknown action: ${action}; expected start, stop, restart, status, or logs`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runAndroidDevServerCli().catch((error) => {
    console.error(`[windows-android-dev-server] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
