/* global process */

import fs from 'node:fs';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

import BetterSqlite3 from 'better-sqlite3';

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
  const page = await app.firstWindow({ timeout: 90_000 });
  await page.waitForFunction(() => globalThis.__FOLIOLE_APP_READY_REPORTED__ === true, null, {
    timeout: 90_000
  });
  return { app, page };
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

function inspectDatabase(evidenceRoot) {
  const databasePath = path.join(evidenceRoot, 'library-c', 'Data', 'foliole.db');
  const db = new BetterSqlite3(databasePath, { fileMustExist: true, readonly: true });
  try {
    const count = (sql) => Number(db.prepare(sql).pluck().get() ?? 0);
    return {
      activeMemberCount: count("SELECT COUNT(*) FROM sync_group_members WHERE state = 'active'"),
      attachmentCount: count('SELECT COUNT(*) FROM attachments'),
      contentBlobCount: count('SELECT COUNT(*) FROM content_blobs'),
      missingAttachmentCount: count("SELECT COUNT(*) FROM attachment_blobs WHERE availability != 'cached'"),
      missingContentBlobCount: count(`SELECT COUNT(*) FROM content_blobs cb
        LEFT JOIN content_blob_data cbd ON cbd.hash = cb.hash WHERE cbd.hash IS NULL`),
      nodeCount: count('SELECT COUNT(*) FROM nodes'),
      reviewLogCount: count('SELECT COUNT(*) FROM review_log')
    };
  } finally { db.close(); }
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
    try {
      candidate = await discoverUniqueGroup(session.page);
      await invoke(session.page, 'request_sync_group_join', { endpoint_url: candidate.endpoint_url });
      await waitForJoinedGroup(session.page, candidate.group_id);
    } finally { await session.app.close(); }
    const firstFacts = inspectDatabase(evidenceRoot);
    assertComplete(firstFacts);
    session = await openSession(paths, evidenceRoot);
    const screenshotPath = path.join(evidenceRoot, 'sync-group-recovery.png');
    try {
      const overview = await invoke(session.page, 'load_companion_pairing_overview');
      if (overview.sync_group?.group_id !== candidate.group_id) {
        throw new Error('Windows C lost Sync Group membership after restart.');
      }
      await captureSyncSettings(session.page, screenshotPath);
    } finally { await session.app.close(); }
    const restartedFacts = inspectDatabase(evidenceRoot);
    assertComplete(restartedFacts);
    const receipt = { candidate: { groupId: candidate.group_id, providerKind: candidate.provider_device_kind },
      firstFacts, restartedFacts, resultStatus: 'success', schemaVersion: 1 };
    const receiptPath = path.join(evidenceRoot, 'sync-group-recovery-receipt.json');
    fs.writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
    return { output: '', syncGroupRecovery: { receiptPath, screenshotPath }, receipt };
  } finally { await controlNativeClient(execute, paths, 'start'); }
}
