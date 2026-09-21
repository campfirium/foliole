/* global console, document, setTimeout, window */

import fs from 'node:fs';
import path from 'node:path';

import { macosAcceptanceEnv } from '../sync-group/multi-device-sync-macos-channel.mjs';
import { observeMacosAnchorAfterElection } from './macos-a5-anchor-observation.mjs';
import { openMacosSyncGroupDesktopSession } from './macos-sync-group-desktop-session.mjs';
import { readS220FinalFixture } from './macos-a5-s220-final-fixture.mjs';
import { inspectS220A5Group } from './macos-a5-s220-group-inspect.mjs';
import { confirmS220A5NetworkRestored } from './macos-a5-s220-network-status.mjs';
import { S220_APP_ID } from './macos-a5-s220-package-inventory.mjs';

const NETWORK_TEST = 'com.foliole.android.FolioleS220NetworkTest';

export function instrumentation(captured, paths, serial, method) {
  const output = captured(paths.adb, ['-s', serial, 'shell', 'am', 'instrument', '-w',
    '-e', 'class', `${NETWORK_TEST}#${method}`,
    `${S220_APP_ID}.test/androidx.test.runner.AndroidJUnitRunner`]);
  if (!output.includes('OK (1 test)')) {
    throw new Error(`S220 network ${method} did not complete its native test.`);
  }
  return output.match(/folioleNetwork=(\{[^\n]+\})/u)?.[1] ?? null;
}

export async function attachS220Page(serial) {
  const { _android } = await import('playwright');
  const devices = await _android.devices({ omitDriverInstall: true });
  const device = devices.find((candidate) => candidate.serial() === serial);
  if (!device) {
    await Promise.all(devices.map((candidate) => candidate.close()));
    throw new Error('Fixed A5 WebView unavailable.');
  }
  const webView = await device.webView({ pkg: S220_APP_ID }, { timeout: 30_000 });
  return { devices, page: await webView.page() };
}

export async function captureFlow(page) {
  await page.getByTestId('companion-scroll-container').waitFor({ timeout: 30_000 });
  return page.evaluate(() => ({ body: document.body.innerText.slice(0, 800),
    controls: [...document.querySelectorAll('[data-testid]')]
      .map((node) => node.getAttribute('data-testid')).filter(Boolean).slice(0, 80) }));
}

export async function runS220A5Offline(args) {
  const { assertFixed, captured, checked, env, paths, serial } = args;
  assertFixed();
  const root = path.join(paths.artifactsRoot, 'S220', 'final-same-tip', 'a5-offline');
  const receiptPath = path.join(root, 'receipt.json');
  if (fs.existsSync(receiptPath)) throw new Error('S220 offline journey already attempted.');
  fs.mkdirSync(root, { recursive: true });
  const beforePath = await inspectS220A5Group({ assertFixed, paths, serial });
  const before = JSON.parse(fs.readFileSync(beforePath, 'utf8'));
  const fixture = readS220FinalFixture(paths);
  const item = before.inspection.reviewTargets.find((node) => node.kind === 'item'
    && node.id === fixture.itemId);
  const reading = before.inspection.reviewTargets.find((node) => node.kind === 'topic'
    && node.title === 'Multi-device sync D fact');
  if (!item || item.body_availability !== 'cached' || fixture.groupId !== before.inspection.group.group_id
    || !reading
    || reading.body_availability !== 'cached' || reading.reading_state !== 'active') {
    throw new Error('S220 cached FSRS and D reading baseline absent.');
  }
  const receipt = { appId: S220_APP_ID, before: { counts: before.counts,
    item, reading, attachments: before.attachments }, serial, stage: 'baseline' };
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
      throw new Error('S220 Android active-network-null precondition was not proved.');
    }
    receipt.stage = 'offline';
    save();
    checked(paths.adb, ['-s', serial, 'shell', 'am', 'start', '-W', '-n',
      `${S220_APP_ID}/com.foliole.android.MainActivity`]);
    const { devices, page } = await attachS220Page(serial);
    try {
      receipt.providerProbe = await page.evaluate(async () => {
        try {
          const response = await Promise.race([
            window.Capacitor.Plugins.FolioleCompanionSync.desktopHttpRequest({
              method: 'GET', url: 'http://192.168.0.10:38643/companion/discovery'
            }),
            new Promise((_, reject) => setTimeout(() => reject(new Error('probe_timeout')), 8_000))
          ]);
          return { reachable: response.status === 200 };
        } catch (error) { return { reachable: false, error: String(error).slice(0, 200) }; }
      });
      if (receipt.providerProbe.reachable) {
        throw new Error('S220 Mac provider is reachable while A5 claims no active network.');
      }
      receipt.flowBefore = await captureFlow(page);
      if (!receipt.flowBefore.body.includes('What survives the final offline restart?')) {
        throw new Error('S220 offline FSRS item not visible before grade.');
      }
      await page.getByTestId('companion-review-action-reveal').click();
      await page.getByTestId('companion-review-grade-3').waitFor({ timeout: 15_000 });
      receipt.answer = await captureFlow(page);
      if (!receipt.answer.body.includes('The new FSRS result and cached topic edit.')) {
        throw new Error('S220 cached answer missing offline.');
      }
      await page.getByTestId('companion-review-grade-3').click();
      receipt.flowAfterGrade = await captureFlow(page);
      receipt.stage = 'graded-offline';
      save();
    } finally {
      await Promise.all(devices.map((candidate) => candidate.close()));
    }
    checked(paths.adb, ['-s', serial, 'shell', 'am', 'force-stop', S220_APP_ID]);
    checked(paths.adb, ['-s', serial, 'shell', 'am', 'start', '-W', '-n',
      `${S220_APP_ID}/com.foliole.android.MainActivity`]);
    const restarted = await attachS220Page(serial);
    try { receipt.flowAfterRestart = await captureFlow(restarted.page); }
    finally { await Promise.all(restarted.devices.map((candidate) => candidate.close())); }
    if (!receipt.flowAfterRestart.body.includes('Multi-device sync D fact')) {
      throw new Error('S220 cached D reading did not survive offline restart.');
    }
    const afterPath = await inspectS220A5Group({ assertFixed, paths, serial });
    const after = JSON.parse(fs.readFileSync(afterPath, 'utf8'));
    receipt.after = { attachments: after.attachments, counts: after.counts,
      review: after.inspection.review, targets: after.inspection.reviewTargets };
    if (after.counts.review_log !== before.counts.review_log + 1
      || after.counts.sync_groups !== before.counts.sync_groups) {
      throw new Error('S220 offline grade was not durably recorded.');
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
  console.log(`[macos-a5-dev] S220 offline journey=${receiptPath}`);
  return receiptPath;
}
