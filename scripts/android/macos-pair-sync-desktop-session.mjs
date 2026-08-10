/* global process */

import { createHash } from 'node:crypto';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

import { MACOS_DAILY_LIBRARY_HOME } from '../macos/macos-electron-dev-paths.mjs';

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
    return globalThis.electronAPI.invoke(commandName, commandArgs);
  }, { commandArgs: args, commandName: command });
}

export async function ensureMacosSyncGroup(actions) {
  const overview = await actions.load();
  return overview.sync_group ? actions.enable() : actions.create();
}

function launchOptions(repoRoot, env, userDataPath) {
  return {
    args: [path.join(repoRoot, 'dist/electron/main.js')],
    cwd: repoRoot,
    env: {
      ...env,
      FOLIOLE_DISABLE_HARDWARE_ACCELERATION: '1',
      FOLIOLE_DISABLE_IN_APP_RELAUNCH: '1',
      FOLIOLE_ELECTRON_NATIVE_HIDDEN: '1',
      FOLIOLE_LIBRARY_HOME: MACOS_DAILY_LIBRARY_HOME,
      FOLIOLE_SESSION_DATA_PATH: userDataPath,
      FOLIOLE_USER_DATA_PATH: userDataPath,
      FOLIOLE_WORKDIR: repoRoot
    },
    executablePath: path.join(
      repoRoot, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'
    ),
    timeout: 90_000
  };
}

export async function openMacosPairSyncDesktopSession({
  env = process.env, electronLauncher, repoRoot, timeoutMs = 90_000, userDataPath
}) {
  const launcher = electronLauncher ?? (await import('playwright'))._electron;
  let app;
  try {
    app = await launcher.launch(launchOptions(repoRoot, env, userDataPath));
    const page = await app.firstWindow({ timeout: timeoutMs });
    await page.waitForFunction(() => globalThis.__FOLIOLE_APP_READY_REPORTED__ === true, null, {
      timeout: timeoutMs
    });
    const syncGroupActions = {
      create: () => invoke(page, 'create_sync_group'),
      enable: () => invoke(page, 'enable_companion_sync'),
      load: () => invoke(page, 'load_companion_pairing_overview')
    };
    return {
      approve: (pairRequestId) => invoke(page, 'approve_companion_pair_request', {
        pair_request_id: pairRequestId
      }),
      assertActive: () => {
        if (app.process().exitCode !== null) throw new Error('Mac desktop runtime ended unexpectedly.');
      },
      close: () => app.close(),
      enable: () => ensureMacosSyncGroup(syncGroupActions),
      leave: () => invoke(page, 'leave_sync_group'),
      load: syncGroupActions.load,
      invoke: (command, args) => invoke(page, command, args),
      remove: (deviceId) => invoke(page, 'remove_companion_paired_device', { device_id: deviceId }),
      sanitize: sanitizeOverview
    };
  } catch (error) {
    await app?.close().catch(() => undefined);
    throw error;
  }
}

export async function waitForMacosPairRequest(session, deviceFingerprint, timeoutMs = 40_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const overview = await session.load();
    if (overview.pending_requests.length > 1) throw new Error('Conflicting pair requests.');
    if (overview.pending_requests.length === 1) {
      const request = overview.pending_requests[0];
      if (fingerprint(request.device_id) !== deviceFingerprint) {
        throw new Error('Pair request belongs to another device.');
      }
      return request;
    }
    await delay(250);
  }
  throw new Error('Timed out waiting for the fixed A5 pair request.');
}

export { fingerprint as macosPairSyncIdentityFingerprint, sanitizeOverview };
