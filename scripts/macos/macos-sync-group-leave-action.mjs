#!/usr/bin/env node
/* global console, process */

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { openMacosPairSyncDesktopSession } from '../android/macos-pair-sync-desktop-session.mjs';
import { MACOS_DAILY_DEBUG_ROOT } from './macos-electron-dev-paths.mjs';

export const EXPECTED_SYNC_GROUP = {
  groupId: 'group-6d377d51-1c49-4b94-899a-e2593f53ec52',
  memberIds: [
    'device-1534955b-3137-40ba-9182-244b86ac05c2',
    'device-33ea4460-7c28-44c1-82f6-35ea045d260e',
    'device-d0fc9ead-d362-4d24-9d51-0dde7c01034e'
  ],
  timelineId: 'timeline-d94d3468-9278-4dcd-8d80-33484154c21e'
};

function assertExpectedGroup(overview, expected) {
  const group = overview.sync_group;
  const memberIds = group?.members.map((member) => member.device_id).sort();
  if (group?.group_id !== expected.groupId || group.timeline_id !== expected.timelineId
      || JSON.stringify(memberIds) !== JSON.stringify([...expected.memberIds].sort())) {
    throw new Error('Current macOS Sync Group does not match the fixed T121-3 acceptance group.');
  }
}

export async function runMacosSyncGroupLeave({
  evidenceRoot, expected = EXPECTED_SYNC_GROUP,
  openSession = openMacosPairSyncDesktopSession, repoRoot = process.cwd()
}) {
  const userDataPath = path.join(repoRoot, MACOS_DAILY_DEBUG_ROOT, 'user-data');
  const session = await openSession({ repoRoot, userDataPath });
  try {
    const before = await session.load();
    assertExpectedGroup(before, expected);
    const after = await session.leave();
    if (after.sync_group !== null || after.paired_devices.length !== 0) {
      throw new Error('macOS did not fully leave the Sync Group.');
    }
    fs.mkdirSync(evidenceRoot, { recursive: true });
    const manifestPath = path.join(evidenceRoot, 'macos-sync-group-leave-manifest.json');
    fs.writeFileSync(manifestPath, `${JSON.stringify({
      action: 'leave-sync-group', completedAt: new Date().toISOString(),
      groupId: expected.groupId, memberIds: expected.memberIds, resultStatus: 'success',
      timelineId: expected.timelineId
    }, null, 2)}\n`, 'utf8');
    return { manifestPath };
  } finally {
    await session.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const identity = new Date().toISOString().replace(/\D/gu, '').slice(0, 17);
  runMacosSyncGroupLeave({
    evidenceRoot: path.join(process.cwd(), '.tmp/artifacts/macos-sync-group-leave', identity)
  }).then(({ manifestPath }) => console.log(`[macos-sync-group-leave] evidence=${manifestPath}`))
    .catch((error) => {
      console.error(`[macos-sync-group-leave] ${error instanceof Error ? error.message : String(error)}`);
      process.exitCode = 1;
    });
}
