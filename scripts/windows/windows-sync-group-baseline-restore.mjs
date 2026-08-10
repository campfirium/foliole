#!/usr/bin/env node
/* global console, process */

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { restoreOwnedLibrary } from '../desktop/sync-group-library-restore.mjs';
import { executeBounded } from './windows-bounded-process.mjs';
import { resolveWindowsProtectionIdentity } from './windows-sync-group-baseline-action.mjs';
import {
  controlWindowsNativeClient, inspectWindowsSyncGroupDatabase, windowsSyncGroupClientPaths
} from './windows-sync-group-recovery-action.mjs';
import {
  restoreWindowsNativeClient, suspendWindowsNativeClient
} from './windows-sync-group-native-lifecycle.mjs';
import { windowsDevPaths } from './windows-dev-paths.mjs';

function assertSourceId(value) {
  if (!/^[0-9]{17}-[0-9a-f]{8}$/u.test(value)) {
    throw new Error('Windows C restore requires one exact protected source id.');
  }
  return value;
}

function assertEmptyCurrent(facts) {
  if (facts.integrity !== 'ok' || facts.activeMemberCount !== 0 || facts.localGroupId !== null
      || facts.localTimelineId !== null || facts.localMemberState !== null
      || facts.userNodeCount !== 0 || facts.contentBlobCount !== 0 || facts.attachmentCount !== 0) {
    throw new Error('Windows C current root is not the isolated empty recovery state.');
  }
}

function assertOriginal(facts) {
  if (facts.integrity !== 'ok' || !facts.deviceIdentity || facts.activeMemberCount < 1
      || !facts.localGroupId || !facts.localTimelineId || facts.localMemberState !== 'active'
      || facts.nodeCount === 0 || facts.contentBlobCount === 0) {
    throw new Error('Windows C protected original is incomplete.');
  }
}

export async function restoreWindowsSyncGroupBaseline({ execute = executeBounded,
  paths = windowsDevPaths(), sourceId }) {
  const fixedSourceId = assertSourceId(sourceId);
  const client = windowsSyncGroupClientPaths(paths);
  const targetRoot = path.dirname(client.libraryHome);
  const protectionParent = path.join(
    paths.repoRoot, '.lab', 'internal', 't121-device-backups', 'windows-c'
  );
  const backupRoot = path.join(protectionParent, fixedSourceId, 'original');
  const quarantineRoot = path.join(protectionParent, fixedSourceId, 'empty-before-restore');
  const inspect = async (databasePath) => {
    const value = await inspectWindowsSyncGroupDatabase(execute, paths, databasePath);
    return { ...value, deviceIdentity: resolveWindowsProtectionIdentity(value) };
  };
  const suspended = await suspendWindowsNativeClient({
    control: controlWindowsNativeClient, execute, paths
  });
  let primaryError = null;
  let result = null;
  try {
    const current = await inspectWindowsSyncGroupDatabase(execute, paths);
    assertEmptyCurrent(current);
    const original = await inspect(path.join(backupRoot, 'library', 'Data', 'foliole.db'));
    assertOriginal(original);
    result = await restoreOwnedLibrary({ backupRoot,
      databaseRelativePath: path.join('library', 'Data', 'foliole.db'), inspectDatabase: inspect,
      quarantineRoot, targetRoot });
    const evidenceRoot = path.join(
      paths.repoRoot, '.tmp', 'artifacts', 't121-windows-c-restore', fixedSourceId
    );
    fs.mkdirSync(evidenceRoot, { recursive: true });
    const manifestPath = path.join(evidenceRoot, 'restore-manifest.json');
    fs.writeFileSync(manifestPath, `${JSON.stringify({ completedAt: new Date().toISOString(),
      current, original, result, resultStatus: 'success', schemaVersion: 1, sourceId: fixedSourceId
    }, null, 2)}\n`, 'utf8');
    result = { ...result, manifestPath };
  } catch (error) { primaryError = error; }
  try { await restoreWindowsNativeClient({
    control: controlWindowsNativeClient, execute, paths, suspended
  }); }
  catch (cleanupError) {
    if (primaryError) primaryError.message += `; cleanup: ${cleanupError.message}`;
    else primaryError = cleanupError;
  }
  if (primaryError) throw primaryError;
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const result = await restoreWindowsSyncGroupBaseline({ sourceId: process.argv[2] });
    console.log(`[t121-windows-c-restore] evidence=${result.manifestPath}`);
  } catch (error) {
    console.error(`[t121-windows-c-restore] ${error.message}`);
    process.exitCode = 1;
  }
}
