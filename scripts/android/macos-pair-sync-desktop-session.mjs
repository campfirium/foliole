/* global process */

import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';

import { appendDesktopHostTimelineEvent } from '../diagnostics/desktop-host-timeline.mjs';
import { MACOS_DAILY_LIBRARY_HOME } from '../macos/macos-electron-dev-paths.mjs';
import {
  acquireMacosHiddenCredentialSessionLock,
  resolveMacosHiddenCredentialSession
} from '../desktop/macos-hidden-electron-credential-session.mjs';
import { prepareMacosHiddenElectronRuntime } from '../desktop/macos-hidden-electron-runtime.mjs';

function fingerprint(value) {
  return createHash('sha256').update(value).digest('hex').slice(0, 16);
}

export function sanitizeMacosPairSyncOverview(overview) {
  const group = overview.sync_group;
  const local = (group?.members ?? []).find(
    (member) => member.state === 'active' && member.host_name === group.local_host_name
  );
  return {
    localAuthorizationFingerprint: local?.authorization_id
      ? fingerprint(local.authorization_id) : null,
    pairedAuthorizationFingerprints: overview.paired_authorizations.map(
      (authorization) => fingerprint(authorization.authorization_id)
    ),
    pendingAuthorizationFingerprints: overview.pending_requests.map(
      (request) => fingerprint(request.pair_request_id)
    ),
    serverLastError: typeof overview.server_status.last_error === 'string'
      ? overview.server_status.last_error.trim().slice(0, 512) || null
      : null,
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

export function resolveFrozenRendererUrl(repoRoot, existsSync = fs.existsSync) {
  const indexPath = path.join(repoRoot, 'dist/desktop/index.html');
  if (!existsSync(indexPath)) {
    throw new Error(`Frozen desktop renderer is missing: ${indexPath}`);
  }
  return pathToFileURL(indexPath).toString();
}

function launchOptions(repoRoot, env, session, libraryHome, executablePath, rendererUrl) {
  return {
    args: [session.bootstrapPath],
    cwd: repoRoot,
    env: {
      ...env,
      FOLIOLE_DISABLE_HARDWARE_ACCELERATION: '1',
      FOLIOLE_DISABLE_IN_APP_RELAUNCH: '1',
      FOLIOLE_ELECTRON_NATIVE_HIDDEN: '1',
      FOLIOLE_HIDDEN_CREDENTIAL_APP_NAME: session.appName,
      FOLIOLE_HIDDEN_CREDENTIAL_MAIN_PATH: path.join(repoRoot, 'dist/electron/main.js'),
      FOLIOLE_LIBRARY_HOME: libraryHome,
      FOLIOLE_SKIP_STARTUP_WINDOW_STATE: '1',
      FOLIOLE_SESSION_DATA_PATH: session.userDataPath,
      FOLIOLE_USER_DATA_PATH: session.userDataPath,
      ELECTRON_RENDERER_URL: rendererUrl,
      FOLIOLE_VITE_HMR: '1',
      FOLIOLE_WORKDIR: repoRoot
    },
    executablePath,
    timeout: 90_000
  };
}

export async function openMacosPairSyncDesktopSession({
  acquireCredentialSession = acquireMacosHiddenCredentialSessionLock,
  env = process.env, electronLauncher, libraryHome = MACOS_DAILY_LIBRARY_HOME,
  logEvent = appendDesktopHostTimelineEvent, operationId = randomUUID(),
  prepareHiddenRuntime = prepareMacosHiddenElectronRuntime,
  rendererExists = fs.existsSync, repoRoot,
  runtimeRoot,
  resolveCredentialSession = resolveMacosHiddenCredentialSession, timeoutMs = 20_000,
  userDataPath: forbiddenUserDataPath
}) {
  if (forbiddenUserDataPath !== undefined) {
    throw new Error('macos_hidden_electron_user_data_override_forbidden');
  }
  const record = (event, payload = {}) => {
    try {
      logEvent({ event, operationId, payload, source: 'macos_pair_sync' });
    } catch {
      // Diagnostics must not change the pairing lifecycle.
    }
  };
  const launcher = electronLauncher ?? (await import('playwright'))._electron;
  const rendererUrl = resolveFrozenRendererUrl(repoRoot, rendererExists);
  record('session_started');
  const runtime = prepareHiddenRuntime({
    appRoot: repoRoot, cacheRoot: env.FOLIOLE_SHARED_CACHE_ROOT ?? runtimeRoot, env
  });
  if (runtime.runtimeIdentity !== 'stable-source-bound' || !runtime.runtimeFingerprint) {
    runtime.cleanup();
    const error = new Error('macos_hidden_electron_keychain_identity_unverified');
    record('session_failed', { message: error.message });
    throw error;
  }
  const credentialSession = resolveCredentialSession(
    repoRoot, runtime.runtimeFingerprint, runtimeRoot
  );
  const releaseCredentialSession = acquireCredentialSession(credentialSession);
  let app;
  let page;
  try {
    app = await launcher.launch(launchOptions(
      repoRoot, env, credentialSession, libraryHome, runtime.executablePath, rendererUrl
    ));
    record('electron_started', { pid: app.process?.()?.pid ?? null });
    page = await app.firstWindow({ timeout: timeoutMs });
    await page.waitForURL(rendererUrl, { timeout: timeoutMs });
    record('renderer_loaded', { url: page.url() });
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
          releaseCredentialSession();
          record('session_closed');
        }
      },
      enable: () => ensureMacosSyncGroup(syncGroupActions),
      leave: () => invoke(page, 'leave_sync_group'),
      load: syncGroupActions.load,
      invoke: (command, args) => invoke(page, command, args),
      sanitize: sanitizeMacosPairSyncOverview
    };
  } catch (error) {
    const pageText = await page?.locator('body').innerText().catch(() => null);
    const pageTitle = await page?.title().catch(() => null);
    record('session_failed', {
      message: error instanceof Error ? error.message : String(error),
      pageText: typeof pageText === 'string' ? pageText.trim().slice(0, 1_024) : null,
      pageTitle,
      pageUrl: page?.url() ?? null
    });
    await app?.close().catch(() => undefined);
    runtime.cleanup();
    releaseCredentialSession();
    throw error;
  }
}

export async function waitForMacosPairRequest(session, expectedHostName, {
  deadline, now = Date.now, signal, timeoutMs = 40_000,
  wait = (ms, options) => delay(ms, undefined, options)
} = {}) {
  const observationDeadline = deadline ?? now() + timeoutMs;
  while (now() < observationDeadline) {
    signal?.throwIfAborted();
    const overview = await session.load();
    if (overview.pending_requests.length > 1) throw new Error('Conflicting pair requests.');
    if (overview.pending_requests.length === 1) {
      const request = overview.pending_requests[0];
      if (request.host_name !== expectedHostName) {
        throw new Error('Pair request belongs to another Host.');
      }
      return request;
    }
    await wait(250, { signal });
  }
  throw new Error('Timed out waiting for the fixed A5 pair request.');
}

export { fingerprint as macosPairSyncAuthorizationFingerprint };
