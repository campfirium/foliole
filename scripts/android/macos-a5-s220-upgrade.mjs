/* global console */

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { inspectS220A5Group } from './macos-a5-s220-group-inspect.mjs';
import { inspectS220A5Packages, S220_APP_ID } from './macos-a5-s220-package-inventory.mjs';
import { assertS220ApkIdentity } from './macos-a5-s220-apk-identity.mjs';

export async function upgradeS220A5Package(args) {
  const { assertFixed, captured, checked, env, execute, markMutationBoundary, paths, serial } = args;
  const evidenceRoot = path.join(paths.artifactsRoot, 'S220', 'final-same-tip', 'a5-upgrade');
  const receiptPath = path.join(evidenceRoot, 'receipt.json');
  if (fs.existsSync(receiptPath)) throw new Error('S220 final upgrade was already attempted.');
  const inventory = await inspectS220A5Packages({ assertFixed, execute, paths, serial });
  if (!inventory.receipt.packages[S220_APP_ID].installed
    || !inventory.receipt.packages['com.foliole.android'].installed
    || !inventory.receipt.packages['com.foliole.android.acceptance'].installed) {
    throw new Error('S220 upgrade requires all three existing package identities.');
  }
  const buildEnv = { ...env, FOLIOLE_ANDROID_ACCEPTANCE_APPLICATION_ID: S220_APP_ID };
  checked('npm', ['run', 'android:web:build'], { cwd: paths.buildRoot, env: buildEnv });
  checked(paths.cap, ['sync', 'android'], { cwd: paths.buildRoot, env: buildEnv });
  checked(paths.gradle, ['--no-daemon', 'assembleDebug', 'assembleDebugAndroidTest'], {
    cwd: path.join(paths.buildRoot, 'android'), env: buildEnv
  });
  const apkIdentity = assertS220ApkIdentity({ captured, env: buildEnv, paths });
  markMutationBoundary();
  checked(paths.adb, ['-s', serial, 'shell', 'am', 'force-stop', S220_APP_ID]);
  fs.mkdirSync(evidenceRoot, { recursive: true });
  const beforePath = await inspectS220A5Group({ assertFixed, paths, serial });
  const before = JSON.parse(fs.readFileSync(beforePath, 'utf8'));
  const backup = spawnSync(paths.adb, ['-s', serial, 'exec-out', 'run-as', S220_APP_ID,
    'tar', '-cf', '-', '.'], { encoding: null, maxBuffer: 128 * 1024 * 1024 });
  if (backup.status !== 0 || !backup.stdout?.length) {
    throw new Error('S220 retained container backup failed; refusing upgrade.');
  }
  const backupPath = path.join(evidenceRoot, 'pre-upgrade-container.tar');
  fs.writeFileSync(backupPath, backup.stdout);
  const receipt = { apkIdentity, appId: S220_APP_ID, backupPath,
    backupSha256: createHash('sha256').update(backup.stdout).digest('hex'),
    before: { counts: before.counts, inspection: before.inspection },
    installAttempted: false, serial };
  const save = () => fs.writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
  save();
  try {
    receipt.installAttempted = true;
    save();
    checked(paths.adb, ['-s', serial, 'install', '-r', paths.apk]);
    const afterPath = await inspectS220A5Group({ assertFixed, paths, serial });
    const after = JSON.parse(fs.readFileSync(afterPath, 'utf8'));
    receipt.after = { counts: after.counts, inspection: after.inspection };
    if (JSON.stringify(receipt.before) !== JSON.stringify(receipt.after)) {
      throw new Error('S220 retained group or review state changed after APK replacement.');
    }
    receipt.status = 'preserved';
    return receiptPath;
  } catch (error) {
    receipt.status = 'failed';
    receipt.error = String(error.message).slice(0, 400);
    throw error;
  } finally {
    receipt.completedAt = new Date().toISOString();
    save();
    console.log(`[macos-a5-dev] S220 upgrade=${receiptPath}`);
  }
}

export async function upgradeS220A5TestPackage(args) {
  const { assertFixed, captured, checked, env, execute, markMutationBoundary, paths, serial } = args;
  const phase = args.phase === 'final' ? 'final-same-tip/a5-test-upgrade'
    : args.phase === 'resource' ? 'a5-resource-test-upgrade'
    : args.phase === 'offline' ? 'a5-offline-test-upgrade' : 'a5-test-upgrade';
  const evidenceRoot = path.join(paths.artifactsRoot, 'S220', phase);
  const receiptPath = path.join(evidenceRoot, 'receipt.json');
  if (fs.existsSync(receiptPath)) throw new Error('S220 test upgrade already attempted.');
  const inventory = await inspectS220A5Packages({ assertFixed, execute, paths, serial });
  if (!inventory.receipt.packages[S220_APP_ID].installed) {
    throw new Error('S220 isolated app is absent; refusing test APK replacement.');
  }
  const buildEnv = { ...env, FOLIOLE_ANDROID_ACCEPTANCE_APPLICATION_ID: S220_APP_ID };
  checked(paths.gradle, ['--no-daemon', 'assembleDebug', 'assembleDebugAndroidTest'], {
    cwd: path.join(paths.buildRoot, 'android'), env: buildEnv
  });
  const apkIdentity = assertS220ApkIdentity({ captured, env: buildEnv, paths });
  fs.mkdirSync(evidenceRoot, { recursive: true });
  const receipt = { apkIdentity, installAttempted: false, serial };
  const save = () => fs.writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
  save();
  try {
    markMutationBoundary();
    receipt.installAttempted = true;
    save();
    checked(paths.adb, ['-s', serial, 'install', '-r', paths.androidTestApk]);
    receipt.status = 'installed';
    return receiptPath;
  } catch (error) {
    receipt.status = 'failed';
    receipt.error = String(error.message).slice(0, 400);
    throw error;
  } finally {
    receipt.completedAt = new Date().toISOString();
    save();
    console.log(`[macos-a5-dev] S220 test upgrade=${receiptPath}`);
  }
}
