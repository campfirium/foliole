/* global console, process, setTimeout */
import { spawn } from 'node:child_process';
import net from 'node:net';

// Must match the `server.url` port in capacitor.config.ts when FOLIOLE_DEV_LIVE_RELOAD=1.
export const COMPANION_LIVE_RELOAD_PORT = 24605;
const READY_TIMEOUT_MS = 60_000;

/** Builds a native shell that loads the companion from this Mac's dev server instead of its bundle. */
export function companionLiveReloadEnv(env) {
  return { ...env, FOLIOLE_DEV_LIVE_RELOAD: '1' };
}

/** The plain shell configuration, so the native project never keeps pointing at the dev server. */
export function companionBundledEnv(env) {
  const next = { ...env };
  delete next.FOLIOLE_DEV_LIVE_RELOAD;
  return next;
}

export function createCompanionLiveServerLaunch({ env = process.env, nodePath = process.execPath, root }) {
  return {
    args: ['node_modules/vite/bin/vite.js', '--config', 'vite.companion.config.ts', '--host', '127.0.0.1'],
    command: nodePath,
    options: {
      cwd: root,
      env: { ...companionBundledEnv(env), FOLIOLE_VITE_HMR: '1', FOLIOLE_VITE_PORT: String(COMPANION_LIVE_RELOAD_PORT) },
      shell: false,
      stdio: 'inherit'
    }
  };
}

export function waitForCompanionLiveServer({ connect = net.connect, timeoutMs = READY_TIMEOUT_MS } = {}) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const socket = connect({ host: '127.0.0.1', port: COMPANION_LIVE_RELOAD_PORT });
      socket.once('connect', () => { socket.destroy(); resolve(); });
      socket.once('error', () => {
        socket.destroy();
        if (Date.now() > deadline) reject(new Error('Companion live reload server did not start.'));
        else setTimeout(attempt, 250);
      });
    };
    attempt();
  });
}

/**
 * Runs the dev server in the foreground until it exits or the user presses Ctrl-C. `start` installs
 * and opens the shell once the server answers; `restore` always runs afterwards.
 */
export async function runCompanionLiveSession({
  root, start, restore, signals = process, spawnProcess = spawn, waitForServer = waitForCompanionLiveServer
}) {
  const launch = createCompanionLiveServerLaunch({ root });
  const server = spawnProcess(launch.command, launch.args, launch.options);
  const exited = new Promise((resolve, reject) => {
    server.once('exit', (code) => resolve(code ?? 0));
    server.once('error', reject);
  });
  const stop = () => server.kill('SIGTERM');
  signals.on('SIGINT', stop);
  signals.on('SIGTERM', stop);
  try {
    await Promise.race([waitForServer(), exited.then(() => { throw new Error('Companion live reload server exited.'); })]);
    await start();
    console.log(`[companion-live] serving the current workspace on port ${COMPANION_LIVE_RELOAD_PORT}; press Ctrl-C to stop`);
    return await exited;
  } finally {
    signals.off('SIGINT', stop);
    signals.off('SIGTERM', stop);
    if (server.exitCode === null && server.signalCode === null) server.kill('SIGTERM');
    await restore();
  }
}
