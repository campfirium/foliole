/* global process, setTimeout */

import { createHash } from 'node:crypto';
import path from 'node:path';

const MAIN_LIBRARY_HOME = 'D:\\X\\U\\Foliole';

function fingerprint(value) {
  return createHash('sha256').update(value).digest('hex').slice(0, 16);
}

function sanitizeOverview(overview) {
  const primary = overview.primary_device_state;
  return {
    desktopPeerFingerprint: primary.local_role === 'primary'
      ? fingerprint(primary.primary_device_id) : null,
    pairedDeviceFingerprints: overview.paired_devices.map((device) => fingerprint(device.device_id)),
    pendingDeviceFingerprints: overview.pending_requests.map((request) => fingerprint(request.device_id)),
    serverState: overview.server_status.state,
    syncEnabled: overview.sync_enabled === true
  };
}

async function invoke(page, command, args) {
  return page.evaluate(async ({ commandName, commandArgs }) => {
    if (!globalThis.electronAPI?.invoke) throw new Error('Desktop native bridge is unavailable.');
    return await globalThis.electronAPI.invoke(commandName, commandArgs);
  }, { commandArgs: args, commandName: command });
}

async function waitForAppReady(page, timeoutMs) {
  await page.waitForFunction(() => globalThis.__FOLIOLE_APP_READY_REPORTED__ === true, null, {
    timeout: timeoutMs
  });
}

function launchOptions(repoRoot, env) {
  return {
    args: [path.join(repoRoot, 'dist', 'electron', 'main.js')],
    cwd: repoRoot,
    env: {
      ...env,
      FOLIOLE_DISABLE_HARDWARE_ACCELERATION: '1',
      FOLIOLE_DISABLE_IN_APP_RELAUNCH: '1',
      FOLIOLE_LIBRARY_HOME: MAIN_LIBRARY_HOME,
      FOLIOLE_WORKDIR: repoRoot
    },
    executablePath: path.join(repoRoot, 'node_modules', 'electron', 'dist', 'electron.exe'),
    timeout: 90_000
  };
}

export async function openPairSyncDesktopSession({
  env = process.env, electronLauncher, repoRoot, timeoutMs = 90_000
}) {
  const launcher = electronLauncher ?? (await import('playwright'))._electron;
  let app;
  let page;
  let stage = 'desktop-runtime-launch';
  try {
    app = await launcher.launch(launchOptions(repoRoot, env));
    stage = 'desktop-runtime-window';
    page = await app.firstWindow({ timeout: timeoutMs });
    stage = 'desktop-runtime-ready';
    await waitForAppReady(page, timeoutMs);
    stage = 'desktop-runtime-paths';
    const libraryPaths = await invoke(page, 'load_library_path_settings');
    if (path.win32.normalize(libraryPaths.library_home).toLowerCase()
        !== path.win32.normalize(MAIN_LIBRARY_HOME).toLowerCase()) {
      throw new Error('Desktop runtime did not resolve the fixed current library.');
    }
  } catch (error) {
    try { await app?.close(); }
    catch { /* Preserve the classified current-library inspection failure. */ }
    throw Object.assign(new Error(error instanceof Error ? error.message : String(error), {
      cause: error
    }), { exitCode: 74, stage });
  }
  return {
    approve: (pairRequestId) => invoke(page, 'approve_companion_pair_request', {
      pair_request_id: pairRequestId
    }),
    close: () => app.close(),
    enable: () => invoke(page, 'enable_companion_sync'),
    load: () => invoke(page, 'load_companion_pairing_overview'),
    sanitize: sanitizeOverview
  };
}

export async function waitForUniquePairRequest(session, deviceFingerprint, {
  timeoutMs = 40_000, wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
} = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const overview = await session.load();
    const pending = overview.pending_requests;
    if (pending.length > 1) throw new Error('Desktop has conflicting companion pair requests.');
    if (pending.length === 1) {
      if (fingerprint(pending[0].device_id) !== deviceFingerprint) {
        throw new Error('Desktop pair request belongs to another device.');
      }
      return pending[0];
    }
    await wait(250);
  }
  throw new Error('Timed out waiting for the fixed A5 pair request.');
}

export { fingerprint as pairSyncIdentityFingerprint, sanitizeOverview };
