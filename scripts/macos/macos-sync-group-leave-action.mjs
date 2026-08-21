#!/usr/bin/env node
/* global console, process */

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { openMacosPairSyncDesktopSession } from '../android/macos-pair-sync-desktop-session.mjs';
import { MACOS_DAILY_DEBUG_ROOT } from './macos-electron-dev-paths.mjs';

export const EXPECTED_SYNC_GROUP = {
  groupId: 'group-6d377d51-1c49-4b94-899a-e2593f53ec52',
  timelineId: 'timeline-d94d3468-9278-4dcd-8d80-33484154c21e'
};

function assertExpectedGroup(overview, expected) {
  const group = overview.sync_group;
  const active = group?.members.filter((member) => member.state === 'active') ?? [];
  const memberHosts = active.map((member) => member.host_name);
  const authorizations = active.map((member) => member.authorization_id);
  if (group?.group_id !== expected.groupId || group.timeline_id !== expected.timelineId
      || active.length !== 3 || memberHosts.some((host) => typeof host !== 'string' || !host)
      || authorizations.some((authorization) => typeof authorization !== 'string' || !authorization)
      || new Set(memberHosts).size !== 3 || new Set(authorizations).size !== 3) {
    throw new Error('Current macOS Sync Group does not match the fixed T121-3 acceptance group.');
  }
  return [...memberHosts].sort();
}

export async function runMacosSyncGroupLeave({
  evidenceRoot, expected = EXPECTED_SYNC_GROUP,
  openSession = openMacosPairSyncDesktopSession, repoRoot = process.cwd()
}) {
  const userDataPath = path.join(repoRoot, MACOS_DAILY_DEBUG_ROOT, 'user-data');
  const session = await openSession({ repoRoot, userDataPath });
  try {
    const before = await session.load();
    const memberHosts = assertExpectedGroup(before, expected);
    const after = await session.leave();
    if (after.sync_group !== null || after.paired_authorizations.length !== 0) {
      throw new Error('macOS did not fully leave the Sync Group.');
    }
    fs.mkdirSync(evidenceRoot, { recursive: true });
    const manifestPath = path.join(evidenceRoot, 'macos-sync-group-leave-manifest.json');
    fs.writeFileSync(manifestPath, `${JSON.stringify({
      action: 'leave-sync-group', completedAt: new Date().toISOString(),
      groupId: expected.groupId, memberHosts, resultStatus: 'success',
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
