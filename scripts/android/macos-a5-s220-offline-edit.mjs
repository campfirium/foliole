/* global console */

import fs from 'node:fs';
import path from 'node:path';

import { macosAcceptanceEnv } from '../sync-group/multi-device-sync-macos-channel.mjs';
import { observeMacosAnchorAfterElection } from './macos-a5-anchor-observation.mjs';
import { openMacosSyncGroupDesktopSession } from './macos-sync-group-desktop-session.mjs';
import { readS220FinalFixture } from './macos-a5-s220-final-fixture.mjs';
import { inspectS220A5Group } from './macos-a5-s220-group-inspect.mjs';
import { confirmS220A5NetworkRestored } from './macos-a5-s220-network-status.mjs';
import { attachS220Page, captureFlow, instrumentation } from './macos-a5-s220-offline.mjs';
import { S220_APP_ID } from './macos-a5-s220-package-inventory.mjs';

async function openCArticle(page) {
  const row = page.getByRole('button', { name: '打开主题 Multi-device sync C fact' });
  const document = page.locator('[data-companion-readable-document="true"]');
  if (await document.count() === 0 && await row.count() === 0) {
    if (await page.getByTestId('companion-review-action-read').count() === 1) {
      await page.getByTestId('companion-top-bar-left-action').click();
    }
    if (await row.count() === 0) await page.getByTestId('companion-tab-browse').click();
  }
  if (await document.count() === 0) await row.click();
  await document.waitFor({ timeout: 20_000 });
  if (await page.getByTestId('companion-reading-exit').count() === 0) await document.click();
  await page.getByTestId('companion-reading-exit').waitFor({ timeout: 20_000 });
  const edit = page.getByRole('button', { name: '编辑主题' });
  await edit.waitFor({ timeout: 15_000 });
  return edit;
}

export async function runS220A5OfflineEdit(args) {
  const { assertFixed, captured, checked, env, paths, serial } = args;
  assertFixed();
  const root = path.join(paths.artifactsRoot, 'S220', 'final-same-tip', 'a5-offline-edit');
  const receiptPath = path.join(root, 'receipt.json');
  if (fs.existsSync(receiptPath)) throw new Error('S220 offline edit already attempted.');
  fs.mkdirSync(root, { recursive: true });
  const beforePath = await inspectS220A5Group({ assertFixed, paths, serial });
  const before = JSON.parse(fs.readFileSync(beforePath, 'utf8'));
  const fixture = readS220FinalFixture(paths);
  const offline = JSON.parse(fs.readFileSync(path.join(path.dirname(root), 'a5-offline',
    'receipt.json'), 'utf8'));
  const c = before.inspection.journeyFacts.find((node) => node.title === 'Multi-device sync C fact');
  if (!c || !c.current_version_id || c.body_availability !== 'cached'
    || offline.resultStatus !== 'success' || fixture.groupId !== before.inspection.group.group_id) {
    throw new Error('S220 C source version or cached body missing.');
  }
  const receipt = { appId: S220_APP_ID, before: c, marker: fixture.marker,
    serial, stage: 'baseline' };
  const save = () => fs.writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
  save();
  const sharedRoot = path.join(paths.artifactsRoot, 'S220', 'fri-native-diagnostic', 'shared');
  const session = await openMacosSyncGroupDesktopSession({ env: macosAcceptanceEnv(env),
    libraryHome: path.join(sharedRoot, 'macos-library'), repoRoot: paths.buildRoot,
    runtimeLogPath: path.join(root, 'desktop-runtime.log'),
    runtimeRoot: path.join(sharedRoot, 'macos-runtime') });
  let disconnected = false;
  try {
    const overview = await session.load();
    if (overview.sync_group?.group_id !== before.inspection.group.group_id
      || overview.server_status?.state !== 'running') throw new Error('S220 Mac group not ready.');
    receipt.anchor = await observeMacosAnchorAfterElection(session);
    checked(paths.adb, ['-s', serial, 'install', '-r', '-t', paths.androidTestApk]);
    disconnected = true;
    receipt.networkOff = instrumentation(captured, paths, serial, 'disconnectOnly');
    if (JSON.parse(receipt.networkOff ?? '{}').offline !== true) {
      throw new Error('S220 offline edit did not prove activeNetwork=null.');
    }
    receipt.stage = 'offline';
    save();
    checked(paths.adb, ['-s', serial, 'shell', 'am', 'start', '-W', '-n',
      `${S220_APP_ID}/com.foliole.android.MainActivity`]);
    const first = await attachS220Page(serial);
    try {
      await captureFlow(first.page);
      const edit = await openCArticle(first.page);
      receipt.articleBefore = await captureFlow(first.page);
      if (!receipt.articleBefore.body.includes('Multi-device sync C fact')) {
        throw new Error('S220 C readable body absent offline.');
      }
      await edit.click();
      const editor = first.page.locator('.cm-content[contenteditable="true"]');
      await editor.waitFor({ timeout: 15_000 });
      await editor.press('End');
      await editor.type(`\n\n${fixture.marker}`);
      await first.page.getByRole('button', { name: '完成' }).click();
      receipt.articleAfterEdit = await captureFlow(first.page);
      const persistedPath = await inspectS220A5Group({ assertFixed, paths, serial });
      const persisted = JSON.parse(fs.readFileSync(persistedPath, 'utf8'));
      receipt.persistedBeforeRestart = persisted.inspection.journeyFacts.find((node) => node.id === c.id);
      if (!receipt.persistedBeforeRestart
        || receipt.persistedBeforeRestart.current_version_id === c.current_version_id
        || receipt.persistedBeforeRestart.body_blob_hash === c.body_blob_hash) {
        throw new Error('S220 offline edit has no durable version before restart.');
      }
      receipt.stage = 'edited-offline';
      save();
    } finally { await Promise.all(first.devices.map((candidate) => candidate.close())); }
    checked(paths.adb, ['-s', serial, 'shell', 'am', 'force-stop', S220_APP_ID]);
    checked(paths.adb, ['-s', serial, 'shell', 'am', 'start', '-W', '-n',
      `${S220_APP_ID}/com.foliole.android.MainActivity`]);
    const second = await attachS220Page(serial);
    try {
      await captureFlow(second.page);
      await openCArticle(second.page);
      receipt.articleAfterRestart = await captureFlow(second.page);
    } finally { await Promise.all(second.devices.map((candidate) => candidate.close())); }
    const afterPath = await inspectS220A5Group({ assertFixed, paths, serial });
    const after = JSON.parse(fs.readFileSync(afterPath, 'utf8'));
    receipt.after = after.inspection.journeyFacts.find((node) => node.id === c.id);
    if (!receipt.articleAfterRestart.body.includes(fixture.marker)
      || !receipt.after || receipt.after.current_version_id === c.current_version_id
      || receipt.after.body_blob_hash === c.body_blob_hash) {
      throw new Error('S220 offline C edit did not survive restart as a new version.');
    }
    receipt.stage = 'restarted-offline';
    save();
  } catch (error) {
    receipt.error = String(error.message).slice(0, 500);
    throw error;
  } finally {
    try {
      if (disconnected) receipt.networkRestored = instrumentation(captured, paths, serial, 'restoreOnly');
    } catch (error) {
      receipt.restoreError = String(error.message).slice(0, 500);
      checked(paths.adb, ['-s', serial, 'shell', 'svc', 'wifi', 'enable']);
      checked(paths.adb, ['-s', serial, 'shell', 'svc', 'data', 'disable']);
    } finally {
      receipt.finalWifi = captured(paths.adb, ['-s', serial, 'shell', 'settings', 'get',
        'global', 'wifi_on']);
      receipt.finalData = captured(paths.adb, ['-s', serial, 'shell', 'settings', 'get',
        'global', 'mobile_data']);
      receipt.completedAt = new Date().toISOString();
      save();
      await session.close();
    }
  }
  try {
    receipt.networkStatus = await confirmS220A5NetworkRestored({ assertFixed,
      execute: args.execute, paths, receipt, serial });
    receipt.resultStatus = 'success';
    save();
  } catch (error) {
    receipt.error = String(error.message).slice(0, 500);
    save();
    throw error;
  }
  console.log(`[macos-a5-dev] S220 offline C edit=${receiptPath}`);
  return receiptPath;
}
