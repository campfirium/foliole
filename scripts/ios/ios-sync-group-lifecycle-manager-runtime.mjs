/* global clearTimeout, fetch, process, setTimeout */

import { closeSync, mkdirSync, openSync, readFileSync, rmSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

import { prepareMacosHiddenElectronRuntime } from '../desktop/macos-hidden-electron-runtime.mjs';
import { waitForAcceptanceObservation } from './ios-simulator-acceptance-runner.mjs';

const TOKEN = 't151-prepare-lifecycle-v1';

export async function reserveLifecycleManagerPort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Could not reserve manager fixture port.');
  await new Promise((resolve) => server.close(resolve));
  return address.port;
}

export function prepareLifecycleManagerRuntime(options, port, revision) {
  const root = path.join(options.artifactDir, 'mac-manager');
  const compiled = path.join(root, 'compiled');
  const entry = path.join(compiled, 'electron/sync/syncGroupLifecycleAcceptanceMain.js');
  rmSync(root, { force: true, recursive: true });
  mkdirSync(root, { recursive: true });
  run(options.repoRoot, process.execPath, [path.resolve(options.repoRoot, 'node_modules/typescript/lib/tsc.js'),
    'electron/sync/syncGroupLifecycleAcceptanceMain.ts', '--outDir', compiled, '--rootDir', '.',
    '--module', 'NodeNext', '--moduleResolution', 'NodeNext', '--target', 'ES2022',
    '--esModuleInterop', '--skipLibCheck']);
  const runtime = prepareMacosHiddenElectronRuntime({ appRoot: options.repoRoot });
  let child = null;
  let logFd = null;
  return {
    endpoint: `http://127.0.0.1:${port}`,
    async start() {
      const readyPath = path.join(root, 'manager-ready.json');
      rmSync(readyPath, { force: true });
      logFd = openSync(path.join(root, 'manager.log'), 'a');
      const env = { ...process.env,
        FOLIOLE_HIDDEN_CREDENTIAL_APP_NAME:
          `Foliole Hidden Native ${runtime.runtimeFingerprint.slice(0, 20)}`,
        FOLIOLE_HIDDEN_CREDENTIAL_MAIN_PATH: entry,
        FOLIOLE_SYNC_GROUP_LIFECYCLE_ARTIFACT_ROOT: root,
        FOLIOLE_SYNC_GROUP_LIFECYCLE_PORT: String(port),
        FOLIOLE_SYNC_GROUP_LIFECYCLE_REPO_ROOT: options.repoRoot,
        FOLIOLE_SYNC_GROUP_LIFECYCLE_REVISION: revision };
      delete env.ELECTRON_RUN_AS_NODE;
      const ready = await waitForAcceptanceObservation({
        accept: (value) => value?.status === 'ready',
        action: () => { child = spawn(runtime.executablePath,
          [path.resolve(options.repoRoot, 'scripts/desktop/macos-hidden-electron-credential-bootstrap.mjs')],
          { cwd: options.repoRoot, env, stdio: ['ignore', logFd, logFd] }); },
        describe: (value) => `lifecycle manager status=${value?.status ?? 'missing'}`,
        initialObservation: 'lifecycle manager receipt was not readable',
        label: 'isolated Mac lifecycle manager', read: () => JSON.parse(readFileSync(readyPath, 'utf8')),
        timeoutMs: 60_000
      });
      return ready;
    },
    async request(pathname, init = {}) {
      const response = await fetch(`http://127.0.0.1:${port}${pathname}`, {
        ...init, headers: { ...init.headers, 'X-Foliole-Lifecycle-Prepare': TOKEN }
      });
      const value = await response.json();
      if (!response.ok) throw new Error(value.error ?? `manager fixture status ${response.status}`);
      return value;
    },
    async stop() {
      if (child && child.exitCode === null) child.kill('SIGTERM');
      if (child) await waitForExit(child, 10_000);
      if (logFd !== null) closeSync(logFd);
      runtime.cleanup();
    }
  };
}

function run(cwd, command, args) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', timeout: 600_000 });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || `${command} failed with ${result.status}`);
}

async function waitForExit(child, timeoutMs) {
  if (child.exitCode !== null) return;
  await new Promise((resolve) => {
    const timer = setTimeout(() => { if (child.exitCode === null) child.kill('SIGKILL'); resolve(); }, timeoutMs);
    child.once('exit', () => { clearTimeout(timer); resolve(); });
  });
}
