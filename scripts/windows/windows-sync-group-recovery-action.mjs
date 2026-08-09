/* global process */

import fs from 'node:fs';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

async function invoke(page, command, args = {}) {
  return page.evaluate(async ({ command, args }) => {
    if (!globalThis.electronAPI?.invoke) throw new Error('Desktop native bridge is unavailable.');
    return globalThis.electronAPI.invoke(command, args);
  }, { args, command });
}

function launchOptions(paths, evidenceRoot) {
  const libraryHome = path.join(evidenceRoot, 'library-c');
  const userData = path.join(evidenceRoot, 'user-data-c');
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
  const app = await launcher.launch(launchOptions(paths, evidenceRoot));
  captureSyncRuntimeLog(app.process(), path.join(evidenceRoot, 'sync-group-runtime.log'));
  const page = await app.firstWindow({ timeout: 90_000 });
  await page.waitForFunction(() => globalThis.__FOLIOLE_APP_READY_REPORTED__ === true, null, {
    timeout: 90_000
  });
  return { app, page };
}

function captureSyncRuntimeLog(child, logPath) {
  const capture = (chunk) => {
    const lines = String(chunk).split(/\r?\n/u).filter((line) =>
      line.includes('[sync-group]') || line.includes('[companion-sync]'));
    if (lines.length) fs.appendFileSync(logPath, `${lines.join('\n')}\n`, 'utf8');
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
  let lastFacts = null;
  while (Date.now() < deadline) {
    lastFacts = await inspectDatabase(execute, paths, evidenceRoot);
    try {
      assertComplete(lastFacts);
      return lastFacts;
    } catch {
      await delay(1_000);
    }
  }
  const logPath = path.join(evidenceRoot, 'sync-group-runtime.log');
  const runtimeLog = fs.existsSync(logPath)
    ? fs.readFileSync(logPath, 'utf8').trim().split(/\r?\n/u).slice(-8).join(' | ')
    : 'unavailable';
  throw new Error(`Timed out waiting for ordinary sync facts: ${JSON.stringify(lastFacts)}; runtime=${runtimeLog}`);
}

async function inspectDatabase(execute, paths, evidenceRoot) {
  const databasePath = path.join(evidenceRoot, 'library-c', 'Data', 'foliole.db');
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
  if (result.code !== 0) throw new Error(`Windows native client ${action} failed.`);
}

function assertComplete(facts) {
  if (facts.activeMemberCount < 2 || facts.nodeCount === 0 || facts.contentBlobCount === 0
      || facts.missingAttachmentCount !== 0 || facts.missingContentBlobCount !== 0) {
    throw new Error(`Windows C did not complete ordinary sync: ${JSON.stringify(facts)}`);
  }
}

export async function runWindowsSyncGroupRecovery({ evidenceRoot, execute, paths }) {
  fs.mkdirSync(evidenceRoot, { recursive: true });
  await controlNativeClient(execute, paths, 'stop');
  try {
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
    const restartedFacts = await inspectDatabase(execute, paths, evidenceRoot);
    assertComplete(restartedFacts);
    const receipt = { candidate: { groupId: candidate.group_id, providerKind: candidate.provider_device_kind },
      firstFacts, restartedFacts, resultStatus: 'success', schemaVersion: 1 };
    const receiptPath = path.join(evidenceRoot, 'sync-group-recovery-receipt.json');
    fs.writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
    return { output: '', syncGroupRecovery: { receiptPath, screenshotPath }, receipt };
  } finally { await controlNativeClient(execute, paths, 'start'); }
}
