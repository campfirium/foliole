/* global process */

import fs from 'node:fs';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const CLIENT_ROOT_NAME = 'windows-sync-group-client-c';

async function invoke(page, command, args = {}) {
  return page.evaluate(async ({ command, args }) => {
    if (!globalThis.electronAPI?.invoke) throw new Error('Desktop native bridge is unavailable.');
    return globalThis.electronAPI.invoke(command, args);
  }, { args, command });
}

function clientPaths(paths) {
  const root = path.join(paths.repoRoot, '.tmp', 'artifacts', CLIENT_ROOT_NAME);
  return { libraryHome: path.join(root, 'library'), userData: path.join(root, 'user-data') };
}

function launchOptions(paths) {
  const { libraryHome, userData } = clientPaths(paths);
  return {
    args: [path.join(paths.repoRoot, 'dist/electron/main.js')], cwd: paths.repoRoot,
    env: { ...process.env, FOLIOLE_DISABLE_HARDWARE_ACCELERATION: '1',
      FOLIOLE_DISABLE_IN_APP_RELAUNCH: '1', FOLIOLE_ELECTRON_NATIVE_HIDDEN: '1',
      FOLIOLE_LIBRARY_HOME: libraryHome, FOLIOLE_SESSION_DATA_PATH: userData,
      FOLIOLE_USER_DATA_PATH: userData, FOLIOLE_WORKDIR: paths.repoRoot },
    executablePath: path.join(paths.repoRoot, 'node_modules/electron/dist/electron.exe'), timeout: 90_000
  };
}

async function openSession(paths, evidenceRoot, electronLauncher) {
  const launcher = electronLauncher ?? (await import('playwright'))._electron;
  const app = await launcher.launch(launchOptions(paths));
  captureSyncRuntimeLog(app.process(), path.join(evidenceRoot, 'sync-group-runtime.log'));
  const page = await app.firstWindow({ timeout: 90_000 });
  await page.waitForFunction(() => globalThis.__FOLIOLE_APP_READY_REPORTED__ === true, null, {
    timeout: 90_000
  });
  return { app, page };
}

function captureSyncRuntimeLog(child, logPath) {
  const capture = (chunk) => {
    const text = String(chunk);
    if (text.includes('[sync-group]') || text.includes('[companion-sync]')) {
      fs.appendFileSync(logPath, text.endsWith('\n') ? text : `${text}\n`, 'utf8');
    }
  };
  child.stdout?.on('data', capture);
  child.stderr?.on('data', capture);
}

async function discoverUniqueGroup(page, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const overview = await invoke(page, 'discover_sync_groups');
    if (overview.join_candidates.length > 1) throw new Error('Multiple Sync Groups were discovered.');
    if (overview.join_candidates.length === 1) return overview.join_candidates[0];
    await delay(1_000);
  }
  throw new Error('Timed out discovering the A5 Sync Group.');
}

async function waitForJoinedGroup(page, expectedGroupId, timeoutMs = 12 * 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const overview = await invoke(page, 'load_companion_pairing_overview');
    if (overview.sync_group?.group_id === expectedGroupId
        && overview.sync_group.local_member_state === 'active') return overview;
    await delay(1_000);
  }
  throw new Error('Timed out waiting for ordinary Sync Group synchronization.');
}

async function waitForOrdinarySyncFacts(execute, paths, evidenceRoot, timeoutMs = 12 * 60_000) {
  const deadline = Date.now() + timeoutMs;
  const nodeSurfaceDeadline = Date.now() + 90_000;
  let lastFacts = null;
  while (Date.now() < deadline) {
    lastFacts = await inspectDatabase(execute, paths);
    try {
      assertComplete(lastFacts);
      return lastFacts;
    } catch {
      const runtimeLog = readSyncRuntimeLog(evidenceRoot);
      if (Date.now() >= nodeSurfaceDeadline && lastFacts.nodeCount <= 2 && runtimeLog !== 'unavailable') {
        throw new Error(`Ordinary sync pack failed before apply: ${JSON.stringify(lastFacts)}; runtime=${runtimeLog}`);
      }
      await delay(1_000);
    }
  }
  const runtimeLog = readSyncRuntimeLog(evidenceRoot);
  throw new Error(`Timed out waiting for ordinary sync facts: ${JSON.stringify(lastFacts)}; runtime=${runtimeLog}`);
}

function readSyncRuntimeLog(evidenceRoot) {
  const logPath = path.join(evidenceRoot, 'sync-group-runtime.log');
  return fs.existsSync(logPath)
    ? fs.readFileSync(logPath, 'utf8').trim().split(/\r?\n/u).slice(-8).join(' | ')
    : 'unavailable';
}

async function inspectDatabase(execute, paths) {
  const databasePath = path.join(clientPaths(paths).libraryHome, 'Data', 'foliole.db');
  const electronPath = path.join(paths.repoRoot, 'node_modules/electron/dist/electron.exe');
  const inspectorPath = path.join(paths.repoRoot, 'scripts/windows/windows-sync-group-recovery-inspect.mjs');
  const result = await execute(electronPath, [inspectorPath, databasePath], {
    cwd: paths.repoRoot, env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    timeoutCode: 'sync_group_inspect_timeout', timeoutMs: 30_000, windowsHide: true
  });
  if (result.code !== 0) throw new Error('Windows C database inspection failed.');
  return JSON.parse(result.stdout.trim());
}

async function captureSyncSettings(page, screenshotPath) {
  await page.getByRole('button', { name: /^(Settings|设置)$/u }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: /^(Sync|同步)$/u }).click();
  await dialog.screenshot({ path: screenshotPath });
}

async function controlNativeClient(execute, paths, action) {
  const script = path.join(paths.repoRoot, 'scripts/windows/windows-client-native.mjs');
  const result = await execute(paths.systemNode, [script, action], {
    cwd: paths.repoRoot, timeoutCode: `native_${action}_timeout`, timeoutMs: 120_000,
    windowsHide: true
  });
  if (result.code !== 0) {
    const detail = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim()
      .split(/\r?\n/u).slice(-12).join(' | ');
    throw new Error(`Windows native client ${action} failed: ${detail || `exit_${result.code}`}`);
  }
}

function assertComplete(facts) {
  if (facts.activeMemberCount !== 2 || facts.nodeCount === 0 || facts.contentBlobCount === 0
      || facts.missingAttachmentCount !== 0 || facts.missingContentBlobCount !== 0) {
    throw new Error(`Windows C did not complete ordinary sync: ${JSON.stringify(facts)}`);
  }
}

export async function runWindowsSyncGroupRecovery({ evidenceRoot, execute, paths }) {
  fs.mkdirSync(evidenceRoot, { recursive: true });
  await controlNativeClient(execute, paths, 'stop');
  let initialFacts = null;
  let primaryError = null;
  let recoveryResult = null;
  try {
    initialFacts = await inspectDatabase(execute, paths);
    let session = await openSession(paths, evidenceRoot);
    let candidate;
    let firstFacts;
    try {
      candidate = await discoverUniqueGroup(session.page);
      await invoke(session.page, 'request_sync_group_join', { endpoint_url: candidate.endpoint_url });
      await waitForJoinedGroup(session.page, candidate.group_id);
      firstFacts = await waitForOrdinarySyncFacts(execute, paths, evidenceRoot);
    } finally { await session.app.close(); }
    session = await openSession(paths, evidenceRoot);
    const screenshotPath = path.join(evidenceRoot, 'sync-group-recovery.png');
    try {
      const overview = await invoke(session.page, 'load_companion_pairing_overview');
      if (overview.sync_group?.group_id !== candidate.group_id) {
        throw new Error('Windows C lost Sync Group membership after restart.');
      }
      await captureSyncSettings(session.page, screenshotPath);
    } finally { await session.app.close(); }
    const restartedFacts = await inspectDatabase(execute, paths);
    assertComplete(restartedFacts);
    const receipt = { candidate: { groupId: candidate.group_id, providerKind: candidate.provider_device_kind },
      firstFacts, restartedFacts, resultStatus: 'success', schemaVersion: 1 };
    const receiptPath = path.join(evidenceRoot, 'sync-group-recovery-receipt.json');
    fs.writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
    recoveryResult = { output: '', syncGroupRecovery: { receiptPath, screenshotPath }, receipt };
  } catch (error) {
    error.message += `; initial=${JSON.stringify(initialFacts)}`;
    primaryError = error;
  }
  try { await controlNativeClient(execute, paths, 'start'); }
  catch (cleanupError) {
    if (primaryError) primaryError.message += `; cleanup: ${cleanupError.message}`;
    else primaryError = cleanupError;
  }
  if (primaryError) throw primaryError;
  return recoveryResult;
}
