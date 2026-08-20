#!/usr/bin/env node
/* global console, process */

import fs from 'node:fs';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';

import { collectAndroidDeviceSnapshot } from './android-device-snapshot.mjs';
import { inspectPairSyncRecoveryWorkspace } from './android-pair-sync-recovery-readiness.mjs';
import { A5_SERIAL, macosA5Paths } from './macos-a5-dev.mjs';
import { openMacosPairSyncDesktopSession } from './macos-pair-sync-desktop-session.mjs';

const APP_ID = 'com.foliole.android';

function assertTwoMemberBaseline(macos, android) {
  const group = macos?.sync_group;
  const inspection = android?.database?.inspection;
  const activeMacosMembers = group?.members?.filter((member) => member.state === 'active').length;
  if (!group?.group_id || !group.timeline_id || group.local_member_state !== 'active'
      || activeMacosMembers !== 2 || android.database?.integrity !== 'ok'
      || inspection?.syncGroupId !== group.group_id
      || inspection.syncGroupTimelineId !== group.timeline_id
      || inspection.activeSyncGroupMemberCount !== 2) {
    throw new Error('A and B do not match the required restarted two-member baseline.');
  }
  return { groupId: group.group_id, timelineId: group.timeline_id };
}

export async function inspectMacosA5SyncGroupBaseline({ collectSnapshot = collectAndroidDeviceSnapshot,
  openSession = openMacosPairSyncDesktopSession, repoRoot = process.cwd(), runAdb, wait = delay }) {
  const paths = macosA5Paths(repoRoot);
  const executeAdb = runAdb ?? (async (args) => {
    const { spawn } = await import('node:child_process');
    return new Promise((resolve, reject) => {
      const child = spawn(paths.adb, args, { stdio: ['ignore', 'pipe', 'pipe'] });
      let stderr = '';
      child.stderr.on('data', (chunk) => { stderr += chunk; });
      child.on('error', reject);
      child.on('close', (code) => code === 0 ? resolve() : reject(new Error(stderr.trim())));
    });
  });
  await executeAdb(['-s', A5_SERIAL, 'shell', 'am', 'force-stop', APP_ID]);
  await executeAdb(['-s', A5_SERIAL, 'shell', 'am', 'start', '-n', `${APP_ID}/.MainActivity`]);
  await wait(2_000);
  await executeAdb(['-s', A5_SERIAL, 'shell', 'am', 'force-stop', APP_ID]);
  const session = await openSession({ repoRoot });
  let macos;
  try { macos = await session.load(); } finally { await session.close(); }
  const android = await collectSnapshot({ adb: paths.adb, appId: APP_ID,
    databaseInspector: inspectPairSyncRecoveryWorkspace, includeEvents: false, serial: A5_SERIAL });
  const identity = assertTwoMemberBaseline(macos, android);
  const root = path.join(repoRoot, '.tmp/artifacts/t121-baseline-inspection');
  fs.mkdirSync(root, { recursive: true });
  const manifestPath = path.join(root, 'macos-a5-baseline.json');
  const evidence = { android: { counts: android.database.counts,
    inspection: android.database.inspection, integrity: android.database.integrity },
  completedAt: new Date().toISOString(), identity, macos: { activeMemberCount: 2,
    localMemberState: macos.sync_group.local_member_state }, resultStatus: 'success', schemaVersion: 1 };
  fs.writeFileSync(manifestPath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  return { evidence, manifestPath };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const result = await inspectMacosA5SyncGroupBaseline({});
    console.log(`[t121-baseline-inspect] evidence=${result.manifestPath}`);
  } catch (error) {
    console.error(`[t121-baseline-inspect] ${error.message}`);
    process.exitCode = 1;
  }
}
