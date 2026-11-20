/* global AbortSignal, fetch, process, setTimeout */

import { execFile, spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';

import { resolveAgentControlDescriptorPath } from './foliole-agent-runtime-paths.mjs';

const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_INTERVAL_MS = 500;
const PROBE_TIMEOUT_MS = 2_000;

export async function runOpenCommand(argv, options = {}) {
  if (argv.length > 0) return failure('invalid_argument', 2);
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;
  const descriptorPath = resolveAgentControlDescriptorPath({ env, homeDir: options.homeDir, platform });
  const probe = () => probeAgentControl(descriptorPath, options.fetch ?? fetch);
  if (await probe()) return { output: { status: 'running' }, status: 0 };
  const target = resolveAppLaunchTarget({ env, execPath: options.execPath, versions: options.versions });
  if (!target) return failure('launch_unavailable', 3);
  if (platform === 'win32' && await (options.readSessionId ?? readWindowsSessionId)() === 0) {
    return failure('interactive_session_required', 3);
  }
  try {
    await (options.launchApp ?? launchApp)(target, { env, platform });
  } catch {
    return failure('launch_failed', 3);
  }
  const ready = await waitFor(probe, options.timeoutMs ?? DEFAULT_TIMEOUT_MS, options.intervalMs ?? DEFAULT_INTERVAL_MS);
  return ready ? { output: { status: 'started' }, status: 0 } : failure('launch_timeout', 3);
}

export function resolveAppLaunchTarget({ env = process.env, execPath = process.execPath, versions = process.versions } = {}) {
  const explicit = env.FOLIOLE_APP_LAUNCH_PATH?.trim();
  if (explicit) return explicit;
  // Packaged Windows and Linux launchers run this script with the app executable in Node mode.
  return env.ELECTRON_RUN_AS_NODE === '1' && versions.electron ? execPath : null;
}

async function probeAgentControl(descriptorPath, fetchImpl) {
  try {
    const descriptor = JSON.parse(await readFile(descriptorPath, 'utf8'));
    if (typeof descriptor?.endpoint !== 'string') return false;
    const response = await fetchImpl(`${descriptor.endpoint.replace(/\/$/u, '')}/agent-control/v1/health`, {
      headers: { 'content-type': 'application/json' },
      method: 'GET',
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS)
    });
    return Boolean(response.ok);
  } catch {
    return false;
  }
}

async function waitFor(check, timeoutMs, intervalMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
    if (await check()) return true;
  }
  return false;
}

export function launchApp(target, { env, platform }) {
  const childEnv = { ...env };
  delete childEnv.ELECTRON_RUN_AS_NODE;
  for (const key of Object.keys(childEnv)) {
    if (key.startsWith('FOLIOLE_AGENT_') || key === 'FOLIOLE_PRODUCT_METADATA_PATH') delete childEnv[key];
  }
  if (platform === 'darwin' && target.endsWith('.app')) {
    // LaunchServices starts the bundle in the user's GUI session; `open` exits once the request is accepted.
    return new Promise((resolve, reject) => {
      execFile('/usr/bin/open', ['-g', '-a', target], { env: childEnv }, (error) => (error ? reject(error) : resolve()));
    });
  }
  return new Promise((resolve, reject) => {
    const child = spawn(target, [], { detached: true, env: childEnv, stdio: 'ignore' });
    child.once('error', reject);
    child.once('spawn', () => {
      child.unref();
      resolve();
    });
  });
}

function readWindowsSessionId() {
  return new Promise((resolve) => {
    execFile('tasklist', ['/FI', `PID eq ${process.pid}`, '/FO', 'CSV', '/NH'], { windowsHide: true }, (error, stdout) => {
      resolve(error ? null : parseTasklistSessionId(stdout));
    });
  });
}

export function parseTasklistSessionId(stdout) {
  const fields = String(stdout).trim().split(/\r?\n/u)[0]?.match(/"([^"]*)"/gu) ?? [];
  const value = fields[3]?.replaceAll('"', '');
  return value && /^\d+$/u.test(value) ? Number(value) : null;
}

function failure(error, status) {
  return { output: { error }, status };
}
