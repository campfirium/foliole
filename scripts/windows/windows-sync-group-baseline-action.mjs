import fs from 'node:fs';
import path from 'node:path';

import { protectOwnedLibrary } from '../desktop/sync-group-library-protection.mjs';
import {
  controlWindowsNativeClient, inspectWindowsSyncGroupDatabase, openWindowsSyncGroupSession,
  windowsSyncGroupClientPaths
} from './windows-sync-group-recovery-action.mjs';

function assertEmptyClient(facts) {
  if (facts.integrity !== 'ok' || !facts.deviceIdentity || facts.localGroupId !== null
      || facts.localTimelineId !== null || facts.localMemberState !== null
      || facts.activeMemberCount !== 0 || facts.nodeCount > 1 || facts.contentBlobCount !== 0
      || facts.attachmentCount !== 0) {
    throw new Error('Windows C did not reach a fresh empty unbound product state.');
  }
}

export async function runWindowsSyncGroupBaselineReset({ buildIdentity, evidenceRoot, execute,
  paths, controlNativeClient = controlWindowsNativeClient,
  inspectDatabase = inspectWindowsSyncGroupDatabase,
  openSession = openWindowsSyncGroupSession, protectLibrary = protectOwnedLibrary }) {
  const client = windowsSyncGroupClientPaths(paths);
  const clientRoot = path.dirname(client.libraryHome);
  const protectionRoot = path.join(
    paths.repoRoot, '.lab', 'internal', 't121-device-backups', 'windows-c', buildIdentity
  );
  const inspect = (databasePath) => inspectDatabase(execute, paths, databasePath);
  fs.mkdirSync(evidenceRoot, { recursive: true });
  await controlNativeClient(execute, paths, 'stop');
  let primaryError = null;
  let result = null;
  try {
    const originalProtection = await protectLibrary({
      backupRoot: path.join(protectionRoot, 'original'),
      databaseRelativePath: path.join('library', 'Data', 'foliole.db'),
      device: 'C', inspectDatabase: inspect, ownerStopped: true, sourceRoot: clientRoot
    });
    fs.rmSync(clientRoot, { force: true, recursive: true });
    fs.mkdirSync(client.libraryHome, { recursive: true });
    fs.mkdirSync(client.userData, { recursive: true });
    const session = await openSession(paths, evidenceRoot);
    await session.app.close();
    const emptyFacts = await inspectDatabase(execute, paths);
    assertEmptyClient(emptyFacts);
    const baselineProtection = await protectLibrary({
      backupRoot: path.join(protectionRoot, 'baseline'),
      databaseRelativePath: path.join('library', 'Data', 'foliole.db'),
      device: 'C', inspectDatabase: inspect, ownerStopped: true, sourceRoot: clientRoot
    });
    const manifestPath = path.join(evidenceRoot, 'sync-group-baseline-reset-manifest.json');
    fs.writeFileSync(manifestPath, `${JSON.stringify({ baselineProtection, buildIdentity,
      completedAt: new Date().toISOString(), emptyFacts, originalProtection,
      resultStatus: 'success', schemaVersion: 1
    }, null, 2)}\n`, 'utf8');
    result = { output: '', syncGroupBaseline: { manifestPath } };
  } catch (error) { primaryError = error; }
  try { await controlNativeClient(execute, paths, 'start'); }
  catch (cleanupError) {
    if (primaryError) primaryError.message += `; cleanup: ${cleanupError.message}`;
    else primaryError = cleanupError;
  }
  if (primaryError) throw primaryError;
  return result;
}
