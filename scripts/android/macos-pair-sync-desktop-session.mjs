/* global process */

import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

import { appendDesktopHostTimelineEvent } from '../diagnostics/desktop-host-timeline.mjs';
import { MACOS_DAILY_LIBRARY_HOME } from '../macos/macos-electron-dev-paths.mjs';
import { prepareMacosHiddenElectronRuntime } from '../desktop/macos-hidden-electron-runtime.mjs';

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
  if (!overview.sync_group) return actions.create();
  return overview.sync_paused === true ? actions.resume() : actions.enable();
}

function launchOptions(repoRoot, env, userDataPath, libraryHome, executablePath) {
  return {
    args: [path.join(repoRoot, 'dist/electron/main.js')],
    cwd: repoRoot,
    env: {
      ...env,
      FOLIOLE_DISABLE_HARDWARE_ACCELERATION: '1',
      FOLIOLE_DISABLE_IN_APP_RELAUNCH: '1',
      FOLIOLE_ELECTRON_NATIVE_HIDDEN: '1',
      FOLIOLE_LIBRARY_HOME: libraryHome,
      FOLIOLE_SESSION_DATA_PATH: userDataPath,
      FOLIOLE_USER_DATA_PATH: userDataPath,
      FOLIOLE_WORKDIR: repoRoot
    },
    executablePath,
    timeout: 90_000
  };
}

export async function openMacosPairSyncDesktopSession({
  env = process.env, electronLauncher, libraryHome = MACOS_DAILY_LIBRARY_HOME,
  logEvent = appendDesktopHostTimelineEvent, operationId = randomUUID(),
  prepareHiddenRuntime = prepareMacosHiddenElectronRuntime,
  repoRoot, timeoutMs = 20_000, userDataPath
}) {
  const record = (event, payload = {}) => {
    try {
      logEvent({ event, operationId, payload, source: 'macos_pair_sync' });
    } catch {
      // Diagnostics must not change the pairing lifecycle.
    }
  };
  const launcher = electronLauncher ?? (await import('playwright'))._electron;
  record('session_started');
  const runtime = prepareHiddenRuntime({ appRoot: repoRoot, env });
  let app;
  try {
    app = await launcher.launch(launchOptions(
      repoRoot, env, userDataPath, libraryHome, runtime.executablePath
    ));
    record('electron_started', { pid: app.process?.()?.pid ?? null });
    const page = await app.firstWindow({ timeout: timeoutMs });
    await page.waitForFunction(() => globalThis.__FOLIOLE_APP_READY_REPORTED__ === true, null, {
      timeout: timeoutMs
    });
    record('session_ready');
    const syncGroupActions = {
      create: () => invoke(page, 'create_sync_group'),
      enable: () => invoke(page, 'enable_companion_sync'),
      load: () => invoke(page, 'load_companion_pairing_overview'),
      resume: () => invoke(page, 'resume_companion_sync')
    };
    return {
      approve: (pairRequestId) => invoke(page, 'approve_companion_pair_request', {
        pair_request_id: pairRequestId
      }),
      assertActive: () => {
        if (app.process().exitCode !== null) throw new Error('Mac desktop runtime ended unexpectedly.');
      },
      close: async () => {
        try {
          await app.close();
        } finally {
          runtime.cleanup();
          record('session_closed');
        }
      },
      enable: () => ensureMacosSyncGroup(syncGroupActions),
      leave: () => invoke(page, 'leave_sync_group'),
      load: syncGroupActions.load,
      invoke: (command, args) => invoke(page, command, args),
      remove: (deviceId) => invoke(page, 'remove_companion_paired_device', { device_id: deviceId }),
      sanitize: sanitizeOverview
    };
  } catch (error) {
    record('session_failed', { message: error instanceof Error ? error.message : String(error) });
    await app?.close().catch(() => undefined);
    runtime.cleanup();
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
