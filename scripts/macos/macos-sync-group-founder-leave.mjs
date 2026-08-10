#!/usr/bin/env node
/* global console, process */

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  MACOS_DAILY_DEBUG_ROOT
} from './macos-electron-dev-paths.mjs';
import { openMacosPairSyncDesktopSession } from '../android/macos-pair-sync-desktop-session.mjs';

function parseArgs(argv) {
  const options = { groupId: '', timelineId: '' };
  for (let index = 0; index < argv.length; index += 2) {
    if (argv[index] === '--group-id') options.groupId = argv[index + 1] ?? '';
    else if (argv[index] === '--timeline-id') options.timelineId = argv[index + 1] ?? '';
    else throw new Error('Founder Leave accepts only expected group and timeline ids.');
  }
  if (!options.groupId || !options.timelineId) {
    throw new Error('Founder Leave requires expected group and timeline ids.');
  }
  return options;
}

export function assertFounderLeaveOverview(overview, expected, phase) {
  const group = overview?.sync_group ?? null;
  if (phase === 'before') {
    if (group?.group_id !== expected.groupId || group?.timeline_id !== expected.timelineId
        || group?.local_member_state !== 'active') {
      throw new Error('macOS A does not match the authorized active Sync Group.');
    }
    return group;
  }
  if (group !== null) throw new Error('macOS A retained Sync Group membership after Leave.');
  return null;
}

function evidenceRoot(repoRoot) {
  const identity = new Date().toISOString().replace(/\D/gu, '').slice(0, 17);
  return path.join(repoRoot, '.tmp/artifacts/t121-3-founder-leave', identity);
}

export async function runMacosSyncGroupFounderLeave({ expected, repoRoot = process.cwd() }) {
  const root = evidenceRoot(repoRoot);
  const session = await openMacosPairSyncDesktopSession({
    repoRoot,
    userDataPath: path.join(repoRoot, MACOS_DAILY_DEBUG_ROOT, 'user-data')
  });
  let before;
  let after;
  try {
    before = assertFounderLeaveOverview(await session.load(), expected, 'before');
    after = await session.leave();
    assertFounderLeaveOverview(after, expected, 'after');
  } finally { await session.close(); }
  const receipt = {
    activeMemberCountBefore: before.members.filter((member) => member.state === 'active').length,
    groupId: before.group_id,
    groupName: before.display_name,
    localMembershipAfter: null,
    resultStatus: 'success',
    schemaVersion: 1,
    timelineId: before.timeline_id
  };
  fs.mkdirSync(root, { recursive: true });
  const receiptPath = path.join(root, 'founder-leave-receipt.json');
  fs.writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  return { receipt, receiptPath };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const expected = parseArgs(process.argv.slice(2));
    const result = await runMacosSyncGroupFounderLeave({ expected });
    console.log(`[macos-sync-group] founder-leave evidence=${result.receiptPath}`);
  } catch (error) {
    console.error(`[macos-sync-group] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
