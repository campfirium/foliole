import fs from 'node:fs';
import path from 'node:path';

import { protectOwnedLibrary } from '../desktop/sync-group-library-protection.mjs';
import { resolveWindowsProtectionIdentity } from './windows-sync-group-baseline-action.mjs';
import {
  controlWindowsNativeClient, inspectWindowsSyncGroupDatabase, windowsSyncGroupClientPaths
} from './windows-sync-group-recovery-action.mjs';

export async function runWindowsSyncGroupTask3Protect({ buildIdentity, evidenceRoot, execute, paths }) {
  const client = windowsSyncGroupClientPaths(paths);
  const sourceRoot = path.dirname(client.libraryHome);
  const backupRoot = path.join(paths.repoRoot, '.lab', 'internal', 't121-device-backups',
    'windows-c', buildIdentity, 'task2-output');
  const inspect = async (databasePath) => {
    const facts = await inspectWindowsSyncGroupDatabase(execute, paths, databasePath);
    return { ...facts, deviceIdentity: resolveWindowsProtectionIdentity(facts) };
  };
  await controlWindowsNativeClient(execute, paths, 'stop');
  let primaryError;
  try {
    const current = await inspectWindowsSyncGroupDatabase(execute, paths);
    if (current.activeMemberCount !== 3 || current.localMemberState !== 'active'
        || current.missingAttachmentCount !== 0 || current.missingContentBlobCount !== 0) {
      throw new Error(`Windows C is not a complete task 2 output: ${JSON.stringify(current)}`);
    }
    const protection = await protectOwnedLibrary({ backupRoot, device: 'C', inspectDatabase: inspect,
      ownerStopped: true, sourceRoot });
    const manifestPath = path.join(evidenceRoot, 'sync-group-task3-protection.json');
    fs.writeFileSync(manifestPath, `${JSON.stringify({ completedAt: new Date().toISOString(),
      current, protection, resultStatus: 'success', schemaVersion: 1
    }, null, 2)}\n`, 'utf8');
    return { output: '', syncGroupTask3Protection: { manifestPath } };
  } catch (error) { primaryError = error; }
  finally {
    try { await controlWindowsNativeClient(execute, paths, 'start'); }
    catch (cleanupError) {
      if (primaryError) primaryError.message += `; cleanup: ${cleanupError.message}`;
      else primaryError = cleanupError;
    }
  }
  if (primaryError) throw primaryError;
}
