/* global console, process, setTimeout */

import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const stateRoot = path.join(repoRoot, '.tmp', 'windows-dev-services');
const host = '127.0.0.1';

export const SERVICES = {
  companion: {
    args: ['node_modules/vite/bin/vite.js', '--config', 'vite.companion.config.ts', '--host', host],
    env: (service) => ({ FOLIOLE_VITE_PORT: String(service.port) }),
    port: 24604,
    readyPath: '/'
  },
  demo: {
    args: ['node_modules/vite/bin/vite.js', '--config', 'vite.demo.config.ts', '--host', host, '--port', '43077', '--strictPort'],
    port: 43077,
    readyPath: '/demo/'
  }
};

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function servicePaths(name, root = stateRoot) {
  return {
    errLog: path.join(root, `${name}.err.log`),
    outLog: path.join(root, `${name}.out.log`),
    state: path.join(root, `${name}.json`)
  };
}

function readyUrl(service) {
  return `http://${host}:${service.port}${service.readyPath}`;
}

function readState(name, root = stateRoot) {
  const filePath = servicePaths(name, root).state;
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function processAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function probeHttp(url, timeoutMs = 1000) {
  return new Promise((resolve) => {
    const request = http.get(url, (response) => {
      response.resume();
      resolve(Boolean(response.statusCode && response.statusCode < 500));
    });
    request.on('error', () => resolve(false));
    request.setTimeout(timeoutMs, () => {
      request.destroy();
      resolve(false);
    });
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

function resolveService(name) {
  const service = SERVICES[name];
  if (!service) {
    throw new Error(`unknown service: ${name}; expected one of ${Object.keys(SERVICES).join(', ')}`);
  }
  return service;
}

export function createServiceLaunch(name, {
  nodePath = process.execPath,
  root = repoRoot,
  stateDirectory = stateRoot
} = {}) {
  const service = resolveService(name);
  const paths = servicePaths(name, stateDirectory);
  return {
    command: nodePath,
    args: service.args,
    cwd: root,
    env: {
      ...process.env,
      ...(service.env?.(service) ?? {})
    },
    paths,
    readyUrl: readyUrl(service),
    spawnOptions: {
      cwd: root,
      detached: true,
      env: {
        ...process.env,
        ...(service.env?.(service) ?? {})
      },
      shell: false,
      windowsHide: true
    }
  };
}

async function getStatus(name, root = stateRoot) {
  const service = resolveService(name);
  const state = readState(name, root);
  const alive = processAlive(state?.pid);
  const ready = alive ? await probeHttp(readyUrl(service)) : false;
  return {
    alive,
    name,
    pid: state?.pid ?? null,
    ready,
    readyUrl: readyUrl(service),
    startedAt: state?.startedAt ?? '',
    state
  };
}

function writeState(name, state, root = stateRoot) {
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(servicePaths(name, root).state, `${JSON.stringify(state, null, 2)}\n`);
}

async function startService(name) {
  const current = await getStatus(name);
  if (current.alive && current.ready) {
    console.log(`[windows-dev-services] ${name} already running pid=${current.pid} url=${current.readyUrl}`);
    return;
  }
  if (current.alive && !current.ready) {
    await stopService(name);
  }

  const launch = createServiceLaunch(name);
  fs.mkdirSync(path.dirname(launch.paths.outLog), { recursive: true });
  const out = fs.openSync(launch.paths.outLog, 'a');
  const err = fs.openSync(launch.paths.errLog, 'a');
  const child = spawn(launch.command, launch.args, {
    ...launch.spawnOptions,
    stdio: ['ignore', out, err]
  });
  child.unref();
  writeState(name, {
    command: launch.command,
    args: launch.args,
    errLog: launch.paths.errLog,
    outLog: launch.paths.outLog,
    pid: child.pid,
    readyUrl: launch.readyUrl,
    startedAt: new Date().toISOString()
  });

  if (!(await waitUntilReady(launch.readyUrl))) {
    throw new Error(`${name} did not become ready at ${launch.readyUrl}; logs=${launch.paths.outLog}`);
  }
  console.log(`[windows-dev-services] ${name} started pid=${child.pid} url=${launch.readyUrl}`);
}

async function stopService(name) {
  const state = readState(name);
  if (!state?.pid || !processAlive(state.pid)) {
    console.log(`[windows-dev-services] ${name} stopped`);
    return;
  }
  if (process.platform === 'win32') {
    spawnSync('taskkill.exe', ['/PID', String(state.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
  } else {
    process.kill(state.pid, 'SIGTERM');
  }
  console.log(`[windows-dev-services] ${name} stopped pid=${state.pid}`);
}

async function printStatus(name) {
  const status = await getStatus(name);
  const state = status.ready ? 'RUNNING' : status.alive ? 'STARTING_OR_STALE' : 'STOPPED';
  console.log(`[windows-dev-services] ${name} status=${state} pid=${status.pid ?? '-'} url=${status.readyUrl}`);
}

function printLogs(name) {
  const paths = servicePaths(name);
  console.log(`[windows-dev-services] ${name} stdout=${paths.outLog}`);
  console.log(`[windows-dev-services] ${name} stderr=${paths.errLog}`);
}

export async function runDevServicesCli(argv = process.argv.slice(2)) {
  const [action = 'status', name = 'companion'] = argv;
  resolveService(name);
  if (action === 'start') return startService(name);
  if (action === 'stop') return stopService(name);
  if (action === 'restart') {
    await stopService(name);
    return startService(name);
  }
  if (action === 'status') return printStatus(name);
  if (action === 'logs') return printLogs(name);
  throw new Error(`unknown action: ${action}; expected start, stop, restart, status, or logs`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runDevServicesCli().catch((error) => {
    console.error(`[windows-dev-services] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
