import fs from 'node:fs';
import path from 'node:path';

import { inventoryLibrary } from './sync-group-library-protection.mjs';

function facts(value) {
  return {
    activeMemberCount: value.activeMemberCount,
    attachmentCount: value.attachmentCount,
    contentBlobCount: value.contentBlobCount,
    deviceIdentity: value.deviceIdentity,
    integrity: value.integrity,
    localGroupId: value.localGroupId,
    localMemberState: value.localMemberState,
    localTimelineId: value.localTimelineId,
    nodeCount: value.nodeCount
  };
}

function assertDistinct(paths) {
  const resolved = paths.map((value) => path.resolve(value));
  if (new Set(resolved).size !== resolved.length) {
    throw new Error('Sync Group restore roots must be distinct.');
  }
  for (const left of resolved) for (const right of resolved) {
    if (left !== right && path.relative(left, right) && !path.relative(left, right).startsWith('..')) {
      throw new Error('Sync Group restore roots must not overlap.');
    }
  }
}

export async function restoreOwnedLibrary({ backupRoot, databaseRelativePath, inspectDatabase,
  quarantineRoot, targetRoot }) {
  const stagingRoot = `${path.resolve(targetRoot)}.restore-pending`;
  assertDistinct([backupRoot, targetRoot, quarantineRoot, stagingRoot]);
  for (const required of [backupRoot, targetRoot]) {
    if (!fs.statSync(required, { throwIfNoEntry: false })?.isDirectory()) {
      throw new Error(`Sync Group restore root is missing: ${required}`);
    }
  }
  if (fs.existsSync(quarantineRoot) || fs.existsSync(stagingRoot)) {
    throw new Error('Sync Group restore destination already exists.');
  }
  const backupFacts = facts(await inspectDatabase(path.join(backupRoot, databaseRelativePath)));
  const backupInventory = inventoryLibrary(backupRoot);
  fs.cpSync(backupRoot, stagingRoot, { errorOnExist: true, recursive: true });
  const stagedFacts = facts(await inspectDatabase(path.join(stagingRoot, databaseRelativePath)));
  if (JSON.stringify(backupFacts) !== JSON.stringify(stagedFacts)
      || JSON.stringify(backupInventory) !== JSON.stringify(inventoryLibrary(stagingRoot))) {
    fs.rmSync(stagingRoot, { force: true, recursive: true });
    throw new Error('Sync Group staged restore differs from its protected source.');
  }
  fs.renameSync(targetRoot, quarantineRoot);
  fs.renameSync(stagingRoot, targetRoot);
  try {
    const restoredFacts = facts(await inspectDatabase(path.join(targetRoot, databaseRelativePath)));
    if (JSON.stringify(restoredFacts) !== JSON.stringify(backupFacts)
        || JSON.stringify(inventoryLibrary(targetRoot)) !== JSON.stringify(backupInventory)) {
      throw new Error('Sync Group restored library differs from its protected source.');
    }
    return { backupFacts, backupInventory, quarantineRoot: path.resolve(quarantineRoot),
      restoredFacts, restoredRoot: path.resolve(targetRoot) };
  } catch (error) {
    const failedRoot = `${quarantineRoot}.failed-restore`;
    fs.renameSync(targetRoot, failedRoot);
    fs.renameSync(quarantineRoot, targetRoot);
    error.message += `; failed restore retained at ${failedRoot}`;
    throw error;
  }
}
