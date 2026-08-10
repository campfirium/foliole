import fs from 'node:fs';
import path from 'node:path';

import { identityFingerprint } from '../android/android-pair-sync-recovery-readiness.mjs';
import {
  controlWindowsNativeClient, inspectWindowsSyncGroupDatabase, invokeWindowsSyncGroupCommand,
  openWindowsSyncGroupSession,
  windowsSyncGroupClientPaths
} from './windows-sync-group-recovery-action.mjs';
import {
  restoreWindowsNativeClient, suspendWindowsNativeClient
} from './windows-sync-group-native-lifecycle.mjs';

function assertEmptyClient(facts) {
  if (facts.integrity !== 'ok' || !facts.deviceIdentity || facts.localGroupId !== null
      || facts.localTimelineId !== null || facts.localMemberState !== null
      || facts.activeMemberCount !== 0 || facts.userNodeCount !== 0 || facts.contentBlobCount !== 0
      || facts.attachmentCount !== 0) {
    throw new Error('Windows C did not reach a fresh empty unbound product state.');
  }
}

export function resolveWindowsProtectionIdentity(inspection, productIdentity = null) {
  if (inspection.deviceIdentity) return inspection.deviceIdentity;
  const active = inspection.activeDeviceIdentities?.win32;
  if (Array.isArray(active) && active.length === 1 && active[0]) return active[0];
  if (productIdentity) return productIdentity;
  throw new Error('Windows C device identity is not uniquely recoverable.');
}

export async function runWindowsSyncGroupBaselineReset({ buildIdentity, evidenceRoot, execute,
  paths, controlNativeClient = controlWindowsNativeClient,
  inspectDatabase = inspectWindowsSyncGroupDatabase,
  loadOverview = (session) => invokeWindowsSyncGroupCommand(
    session.page, 'load_companion_pairing_overview'
  ),
  openSession = openWindowsSyncGroupSession }) {
  const client = windowsSyncGroupClientPaths(paths);
  const clientRoot = path.dirname(client.libraryHome);
  let productIdentity = null;
  const inspect = async (databasePath) => {
    const facts = await inspectDatabase(execute, paths, databasePath);
    return { ...facts,
      deviceIdentity: resolveWindowsProtectionIdentity(facts, productIdentity) };
  };
  fs.mkdirSync(evidenceRoot, { recursive: true });
  const suspended = await suspendWindowsNativeClient({ control: controlNativeClient, execute, paths });
  let primaryError = null;
  let result = null;
  try {
    fs.rmSync(clientRoot, { force: true, recursive: true });
    fs.mkdirSync(client.libraryHome, { recursive: true });
    fs.mkdirSync(client.userData, { recursive: true });
    const session = await openSession(paths, evidenceRoot);
    const overview = await loadOverview(session);
    productIdentity = identityFingerprint(overview?.primary_device_state?.primary_device_id);
    await session.app.close();
    const emptyFacts = await inspect(path.join(client.libraryHome, 'Data', 'foliole.db'));
    assertEmptyClient(emptyFacts);
    const manifestPath = path.join(evidenceRoot, 'sync-group-baseline-reset-manifest.json');
    fs.writeFileSync(manifestPath, `${JSON.stringify({ buildIdentity,
      completedAt: new Date().toISOString(), emptyFacts,
      resultStatus: 'success', schemaVersion: 1
    }, null, 2)}\n`, 'utf8');
    result = { output: '', syncGroupBaseline: { manifestPath } };
  } catch (error) { primaryError = error; }
  try { await restoreWindowsNativeClient({ control: controlNativeClient, execute, paths, suspended }); }
  catch (cleanupError) {
    if (primaryError) primaryError.message += `; cleanup: ${cleanupError.message}`;
    else primaryError = cleanupError;
  }
  if (primaryError) throw primaryError;
  return result;
}
