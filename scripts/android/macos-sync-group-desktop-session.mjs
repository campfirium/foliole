/* global process */

import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { MACOS_DAILY_LIBRARY_HOME } from '../macos/macos-electron-dev-paths.mjs';
import {
  acquireMacosHiddenCredentialSessionLock,
  resolveMacosHiddenCredentialSession
} from '../desktop/macos-hidden-electron-credential-session.mjs';
import { prepareMacosHiddenElectronRuntime } from '../desktop/macos-hidden-electron-runtime.mjs';
import { resolveFrozenRendererUrl } from './macos-pair-sync-desktop-session.mjs';
import { loadDesktopRoutePeerIds } from '../desktop/desktop-dnssd-route-observation.mjs';
import {
  loadDesktopDnsSdIdentityPreflight, validateDesktopDnsSdIdentity
} from '../desktop/desktop-dnssd-identity-preflight.mjs';
import { captureSyncRuntimeLog } from '../sync-group/sync-runtime-log.mjs';
import {
  waitForDesktopProductEvent, waitForDesktopProductState
} from '../acceptance/desktop-product-event.mjs';

async function invoke(page, command, args) {
  return page.evaluate(async ({ commandName, commandArgs }) => {
    if (!globalThis.electronAPI?.invoke) throw new Error('Desktop native bridge is unavailable.');
    return globalThis.electronAPI.invoke(commandName, commandArgs);
  }, { commandArgs: args, commandName: command });
}

function loadSyncTriggerResult(app) {
  return app.evaluate(() => {
    const pathApi = process.getBuiltinModule('node:path');
    const moduleApi = process.getBuiltinModule('node:module');
    if (!pathApi || !moduleApi) throw new Error('Node built-ins unavailable.');
    const mainPath = process.env.FOLIOLE_HIDDEN_CREDENTIAL_MAIN_PATH;
    if (!mainPath) throw new Error('Hidden Electron main path is unavailable.');
    const loadModule = moduleApi.createRequire(mainPath);
    return loadModule(pathApi.join(pathApi.dirname(mainPath),
      'sync', 'desktopSyncCoordinator.js')).loadDesktopSyncTriggerResult();
  });
}

export function sanitizeMacosSyncGroupOverview(overview) {
  return {
    currentDevice: overview.current_device ?? null,
    deviceCount: overview.sync_group?.devices?.length ?? 0,
    groupId: overview.sync_group?.group_id ?? null,
    pendingRequestIds: overview.join_requests.map((request) => request.request_id),
    serverLastError: typeof overview.server_status.last_error === 'string'
      ? overview.server_status.last_error.trim().slice(0, 512) || null : null,
    serverPort: overview.server_status.port,
    serverState: overview.server_status.state,
    syncEnabled: overview.sync_enabled === true
  };
}

export async function ensureMacosDeviceSyncGroup(actions) {
  const overview = await actions.load();
  if (!overview.sync_group) return actions.create();
  return overview.sync_paused === true ? actions.resume() : actions.enable();
}

function launchOptions(repoRoot, env, session, libraryHome, runtime, rendererUrl) {
  return {
    args: [session.bootstrapPath], cwd: repoRoot,
    env: { ...env, FOLIOLE_DISABLE_HARDWARE_ACCELERATION: '1',
      FOLIOLE_DISABLE_IN_APP_RELAUNCH: '1', FOLIOLE_ELECTRON_NATIVE_HIDDEN: '1',
      FOLIOLE_HIDDEN_CREDENTIAL_APP_NAME: session.appName,
      FOLIOLE_HIDDEN_CREDENTIAL_MAIN_PATH: path.join(repoRoot, 'dist/electron/main.js'),
      FOLIOLE_LIBRARY_HOME: libraryHome, FOLIOLE_SKIP_STARTUP_WINDOW_STATE: '1',
      FOLIOLE_SESSION_DATA_PATH: session.userDataPath, FOLIOLE_USER_DATA_PATH: session.userDataPath,
      ELECTRON_RENDERER_URL: rendererUrl, FOLIOLE_VITE_HMR: '1', FOLIOLE_WORKDIR: repoRoot },
    executablePath: runtime.executablePath, timeout: 90_000
  };
}

export async function openMacosSyncGroupDesktopSession({
  acquireCredentialSession = acquireMacosHiddenCredentialSessionLock,
  env = process.env, electronLauncher, libraryHome = MACOS_DAILY_LIBRARY_HOME,
  operationId = randomUUID(), prepareHiddenRuntime = prepareMacosHiddenElectronRuntime,
  rendererExists = fs.existsSync, repoRoot, runtimeLogPath, runtimeRoot,
  resolveCredentialSession = resolveMacosHiddenCredentialSession, timeoutMs = 20_000
}) {
  void operationId;
  const launcher = electronLauncher ?? (await import('playwright'))._electron;
  const rendererUrl = resolveFrozenRendererUrl(repoRoot, rendererExists);
  const runtime = prepareHiddenRuntime({
    appRoot: repoRoot, cacheRoot: env.FOLIOLE_SHARED_CACHE_ROOT ?? runtimeRoot, env
  });
  if (runtime.runtimeIdentity !== 'stable-source-bound' || !runtime.runtimeFingerprint) {
    runtime.cleanup();
    throw new Error('macos_hidden_electron_keychain_identity_unverified');
  }
  const credentialSession = resolveCredentialSession(repoRoot, runtime.runtimeFingerprint, runtimeRoot);
  const releaseCredentialSession = acquireCredentialSession(credentialSession);
  let app;
  try {
    app = await launcher.launch(launchOptions(
      repoRoot, env, credentialSession, libraryHome, runtime, rendererUrl
    ));
    if (runtimeLogPath) captureSyncRuntimeLog(app.process(), runtimeLogPath);
    const page = await app.firstWindow({ timeout: timeoutMs });
    await page.waitForURL(rendererUrl, { timeout: timeoutMs });
    await page.waitForFunction(() => globalThis.__FOLIOLE_APP_READY_REPORTED__ === true, null, {
      timeout: timeoutMs
    });
    const actions = {
      create: () => invoke(page, 'create_sync_group'),
      enable: () => invoke(page, 'enable_companion_sync'),
      load: () => invoke(page, 'load_sync_group_overview'),
      resume: () => invoke(page, 'resume_companion_sync')
    };
    return {
      accept: (requestId) => invoke(page, 'accept_sync_group_join_request', {
        request_id: requestId
      }),
      assertActive: () => {
        if (app.process().exitCode !== null) throw new Error('Mac desktop runtime ended unexpectedly.');
      },
      close: async () => {
        try { await app.close(); }
        finally { runtime.cleanup(); releaseCredentialSession(); }
      },
      enable: () => ensureMacosDeviceSyncGroup(actions),
      leave: () => invoke(page, 'leave_sync_group'),
      load: actions.load,
      loadDnsSdIdentityPreflight: (groupId) => loadDesktopDnsSdIdentityPreflight(app, groupId),
      loadRoutePeerIds: (groupId) => loadDesktopRoutePeerIds(app, groupId),
      loadSyncTriggerResult: () => loadSyncTriggerResult(app),
      processId: app.process().pid,
      invoke: (command, args) => invoke(page, command, args),
      waitForEvent: (eventName, options) => waitForDesktopProductEvent(page, eventName, options),
      waitForState: (options) => waitForDesktopProductState(page, options),
      sanitize: sanitizeMacosSyncGroupOverview,
      validateDnsSdIdentity: (identityKey) => validateDesktopDnsSdIdentity(app, identityKey)
    };
  } catch (error) {
    await app?.close().catch(() => undefined);
    runtime.cleanup(); releaseCredentialSession();
    throw error;
  }
}

function completedAutomaticRun(result, previousRunId) {
  return result?.run_id !== previousRunId && result?.reason === 'automatic'
    && result?.status === 'completed';
}

export async function waitForMacosAutomaticRun(session, previousRunId, {
  timeoutMs = 90_000
} = {}) {
  const current = await session.loadSyncTriggerResult();
  if (completedAutomaticRun(current, previousRunId)) return current;
  await session.waitForEvent('onWorkspaceSyncApplied', { timeoutMs });
  const result = await session.loadSyncTriggerResult();
  if (!completedAutomaticRun(result, previousRunId)) {
    throw new Error(`Mac automatic sync did not complete: ${JSON.stringify(result)}`);
  }
  return result;
}

export async function waitForMacosDeviceRequest(session, expectedDeviceName, {
  signal, timeoutMs = 90_000
} = {}) {
  signal?.throwIfAborted();
  const overview = await session.waitForState({ command: 'load_sync_group_overview',
    condition: { count: 1, kind: 'join-request-count' },
    eventName: 'onSyncGroupJoinRequestsChanged', timeoutMs });
  const requests = overview.join_requests;
  if (requests.length !== 1) throw new Error('Conflicting Device join requests.');
  if (expectedDeviceName && requests[0].device_name !== expectedDeviceName) {
    throw new Error('Join request belongs to another Device.');
  }
  return requests[0];
}
