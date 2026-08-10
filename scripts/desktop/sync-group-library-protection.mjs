import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

function safeRelative(root, target) {
  const relative = path.relative(root, target);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function walkFiles(root, current = root) {
  return fs.readdirSync(current, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(current, entry.name);
    if (entry.isDirectory()) return walkFiles(root, absolute);
    if (!entry.isFile()) throw new Error(`Unsupported protected library entry: ${absolute}`);
    return [path.relative(root, absolute)];
  }).sort();
}

export function inventoryLibrary(root) {
  const digest = createHash('sha256');
  let totalBytes = 0;
  const files = walkFiles(root);
  for (const relative of files) {
    const bytes = fs.readFileSync(path.join(root, relative));
    totalBytes += bytes.length;
    digest.update(relative).update('\0').update(bytes).update('\0');
  }
  return { digest: digest.digest('hex'), fileCount: files.length, totalBytes };
}

function assertProtectionPaths(sourceRoot, backupRoot) {
  const source = path.resolve(sourceRoot);
  const backup = path.resolve(backupRoot);
  if (source === backup || safeRelative(source, backup) || safeRelative(backup, source)) {
    throw new Error('Sync Group protection roots must not overlap.');
  }
  if (!fs.statSync(source, { throwIfNoEntry: false })?.isDirectory()) {
    throw new Error('Sync Group source library is missing.');
  }
  if (fs.existsSync(backup)) throw new Error('Sync Group protection destination already exists.');
}

function stableFacts(inspection) {
  return {
    activeMemberCount: inspection.activeMemberCount,
    attachmentCount: inspection.attachmentCount,
    contentBlobCount: inspection.contentBlobCount,
    deviceIdentity: inspection.deviceIdentity,
    integrity: inspection.integrity,
    localGroupId: inspection.localGroupId,
    localMemberState: inspection.localMemberState,
    localTimelineId: inspection.localTimelineId,
    missingAttachmentCount: inspection.missingAttachmentCount,
    missingContentBlobCount: inspection.missingContentBlobCount,
    nodeCount: inspection.nodeCount
  };
}

export async function protectOwnedLibrary({ backupRoot, device, inspectDatabase, ownerStopped,
  sourceRoot, databaseRelativePath = path.join('Data', 'foliole.db') }) {
  if (!['A', 'C'].includes(device)) throw new Error('Desktop protection device is invalid.');
  if (ownerStopped !== true) throw new Error('Desktop database owner must be stopped before protection.');
  assertProtectionPaths(sourceRoot, backupRoot);
  const sourceDatabase = path.join(sourceRoot, databaseRelativePath);
  const before = stableFacts(await inspectDatabase(sourceDatabase));
  if (before.integrity !== 'ok' || !before.deviceIdentity) {
    throw new Error('Desktop source database is not a complete protection baseline.');
  }
  fs.cpSync(sourceRoot, backupRoot, { errorOnExist: true, recursive: true });
  const copiedDatabase = path.join(backupRoot, databaseRelativePath);
  const after = stableFacts(await inspectDatabase(copiedDatabase));
  const sourceInventory = inventoryLibrary(sourceRoot);
  const copiedInventory = inventoryLibrary(backupRoot);
  if (JSON.stringify(before) !== JSON.stringify(after)
      || JSON.stringify(sourceInventory) !== JSON.stringify(copiedInventory)) {
    throw new Error('Desktop protection copy does not match the stopped source library.');
  }
  return {
    counts: { attachments: before.attachmentCount, contentBlobs: before.contentBlobCount,
      missingAttachments: before.missingAttachmentCount,
      missingContentBlobs: before.missingContentBlobCount, nodes: before.nodeCount },
    device,
    deviceIdentity: before.deviceIdentity,
    groupId: before.localGroupId,
    integrity: 'ok',
    inventory: copiedInventory,
    localMemberState: before.localMemberState,
    restorable: true,
    restorePoint: path.resolve(backupRoot),
    timelineId: before.localTimelineId
  };
}
