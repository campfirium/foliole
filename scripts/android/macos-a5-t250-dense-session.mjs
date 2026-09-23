/* global console */

import fs from 'node:fs';
import path from 'node:path';

import { macosAcceptanceEnv } from '../sync-group/multi-device-sync-macos-channel.mjs';
import {
  openMacosSyncGroupDesktopSession, waitForMacosDeviceRequest
} from './macos-sync-group-desktop-session.mjs';
import { runMacosA5InstrumentationMechanics } from './macos-a5-sync-group-maintenance-action.mjs';
import { runT250UiAcceptance } from './macos-a5-t250-ui-acceptance.mjs';
import { runMacosA5SyncGroupMaintenance } from '../sync-group/a5-sync-group-action.mjs';

const APP_ID = 'com.foliole.android.t250dense';
const MAIN_COMPONENT = 'com.foliole.android/com.foliole.android.MainActivity';
const JOIN_TEST = 'com.foliole.android.FolioleCompanionSyncGroupJoinTest';

function assertApkIdentity(args, env) {
  const analyzer = path.join(env.ANDROID_SDK_ROOT, 'cmdline-tools/latest/bin/apkanalyzer');
  const read = (file) => args.captured(analyzer, ['manifest', 'print', file], { env });
  const app = read(args.paths.apk);
  const test = read(args.paths.androidTestApk);
  const packageId = (xml) => xml.match(/<manifest\b[^>]*\bpackage="([^"]+)"/u)?.[1];
  if (packageId(app) !== APP_ID || packageId(test) !== `${APP_ID}.test`
    || !test.includes(`android:targetPackage="${APP_ID}"`)) {
    throw new Error('T250 APK and test APK identities do not match the dedicated package.');
  }
}

async function inspectPackages(args) {
  const packages = {};
  for (const appId of ['com.foliole.android', 'com.foliole.android.acceptance', APP_ID]) {
    const result = await args.execute(args.paths.adb,
      ['-s', args.serial, 'shell', 'pm', 'path', '--user', '0', appId],
      { timeoutMs: 30_000 });
    if (result.code !== 0 && String(result.output).trim()) {
      throw new Error(`T250 package inventory failed for ${appId}.`);
    }
    packages[appId] = result.code === 0 && String(result.output).includes('package:');
  }
  return packages;
}

function buildDedicatedApp(args, env) {
  args.checked('npm', ['run', 'android:web:build'], { cwd: args.paths.buildRoot, env });
  args.checked(args.paths.cap, ['sync', 'android'], { cwd: args.paths.buildRoot, env });
  args.checked(args.paths.gradle, ['--no-daemon', 'assembleDebug', 'assembleDebugAndroidTest'], {
    cwd: path.join(args.paths.buildRoot, 'android'), env
  });
  assertApkIdentity(args, env);
  args.checked('npm', ['run', 'build'], { cwd: args.paths.buildRoot, env });
  args.checked('npm', ['run', 'electron:compile'], { cwd: args.paths.buildRoot, env });
}

function previousSession(root, articleId) {
  const sessions = path.join(root, 'a5-session');
  if (!fs.existsSync(sessions)) return null;
  const receipts = fs.readdirSync(sessions).sort().reverse();
  for (const name of receipts) {
    const file = path.join(sessions, name, 'receipt.json');
    if (!fs.existsSync(file)) continue;
    const previous = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (previous.appId === APP_ID && previous.articleId === articleId
      && ['closed', 'passed'].includes(previous.status) && previous.afterPackages?.[APP_ID]
      && previous.groupId) return previous;
  }
  return null;
}

export async function runT250DenseSession(args) {
  args.assertFixed();
  const root = path.join(args.paths.artifactsRoot, 't250-dense-annotation');
  const libraryHome = path.join(root, 'macos-library');
  const sourceReceipt = path.join(root, 'source-receipt.json');
  if (!fs.existsSync(sourceReceipt)) throw new Error('T250 source article is not prepared.');
  const source = JSON.parse(fs.readFileSync(sourceReceipt, 'utf8'));
  if (source.created !== 350) throw new Error('T250 requires 350 prepared highlights.');
  const beforePackages = await inspectPackages(args);
  const previous = previousSession(root, source.articleId);
  if (!beforePackages['com.foliole.android']
    || !beforePackages['com.foliole.android.acceptance']
    || beforePackages[APP_ID] !== Boolean(previous)) {
    throw new Error('T250 requires both protected apps and a package owned by this acceptance.');
  }
  const env = { ...macosAcceptanceEnv(args.env),
    FOLIOLE_ANDROID_ACCEPTANCE_APPLICATION_ID: APP_ID };
  buildDedicatedApp(args, env);
  const evidenceRoot = path.join(root, 'a5-session', args.buildIdentity());
  fs.mkdirSync(evidenceRoot, { recursive: true });
  const receiptPath = path.join(evidenceRoot, 'receipt.json');
  const receipt = { appId: APP_ID, articleId: source.articleId, beforePackages,
    status: 'prepared' };
  const save = () => fs.writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
  save();
  let session;
  try {
    session = await openMacosSyncGroupDesktopSession({ env,
      libraryHome, repoRoot: args.paths.buildRoot,
      runtimeRoot: path.join(root, 'macos-runtime'),
      runtimeLogPath: path.join(evidenceRoot, 'provider-runtime.log') });
    const overview = await session.enable();
    if (previous && overview.sync_group?.group_id !== previous.groupId) {
      throw new Error('T250 Mac source group changed between sessions.');
    }
    receipt.groupId = overview.sync_group?.group_id;
    receipt.status = 'provider-ready';
    save();
    args.markMutationBoundary?.();
    args.checked(args.paths.adb, ['-s', args.serial, 'install', '-r', args.paths.apk]);
    receipt.status = 'installed';
    save();
    const join = previous ? null : await runMacosA5InstrumentationMechanics({ appId: APP_ID,
      buildIdentity: path.basename(evidenceRoot), env, evidenceRoot: path.join(evidenceRoot, 'join'),
      execute: args.execute, expectedGroupId: overview.sync_group.group_id,
      expectedGroupTag: overview.sync_group.group_tag,
      installMain: false, instrumentationArgs: ['-e', 'joinOnly', 'true'],
      observeConcurrently: true, observeWhileTransportOpen: async (options) => {
        const request = await waitForMacosDeviceRequest(session, null, options);
        await session.accept(request.request_id);
        return { groupId: overview.sync_group.group_id, requestId: request.request_id };
      }, paths: args.paths, serial: args.serial, testClass: JOIN_TEST,
      validateInstrumentation: (evidence) => {
        if (!/"joined":true/u.test(evidence.stdout)
          || !/"restarted":true/u.test(evidence.stdout)) {
          throw new Error('T250 product join or restart did not complete.');
        }
      } });
    receipt.join = join ? { evidencePath: join.evidencePath, observation: join.observation } : previous.join;
    receipt.afterPackages = await inspectPackages(args);
    if (!receipt.afterPackages['com.foliole.android']
      || !receipt.afterPackages['com.foliole.android.acceptance']
      || !receipt.afterPackages[APP_ID]) throw new Error('T250 package identities changed unexpectedly.');
    const syncEvents = await runMacosA5SyncGroupMaintenance({
      action: 'read-sync-events', appId: APP_ID, buildIdentity: path.basename(evidenceRoot),
      env, evidenceRoot: path.join(evidenceRoot, 'sync-events'), execute: args.execute,
      installMain: false, paths: args.paths, serial: args.serial
    });
    const projection = JSON.parse(fs.readFileSync(syncEvents.manifestPath, 'utf8')).receipt;
    if (projection.group_id !== receipt.groupId) throw new Error('T250 A5 group identity mismatch.');
    const dense = projection.dense_facts;
    if (dense?.article_id !== source.articleId || dense.child_count !== 350
      || dense.ready_child_body_count !== 350 || dense.target_note_matches !== true
      || !projection.events?.some((event) => event.status === 'completed')) {
      throw new Error('T250 A5 synchronized article, bodies, or terminal run is incomplete.');
    }
    receipt.syncEvents = syncEvents.manifestPath;
    receipt.denseFacts = dense;
    args.checked(args.paths.adb, ['-s', args.serial, 'shell', 'am', 'start', '-W',
      '-n', `${APP_ID}/com.foliole.android.MainActivity`]);
    receipt.status = 'ready';
    save();
    receipt.ui = await runT250UiAcceptance({ articleId: source.articleId,
      evidenceRoot, serial: args.serial });
    receipt.status = 'passed';
    save();
    console.log(`[macos-a5-dev] t250-dense-session-passed=${receiptPath}`);
  } catch (error) {
    receipt.status = 'failed';
    receipt.error = String(error.message).slice(0, 400);
    throw error;
  } finally {
    try { await session?.close(); } finally {
      args.checked(args.paths.adb, ['-s', args.serial, 'shell', 'am', 'start', '-W',
        '-n', MAIN_COMPONENT]);
      if (receipt.status === 'ready') receipt.status = 'closed';
      save();
    }
  }
}
