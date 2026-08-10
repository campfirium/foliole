import fs from 'node:fs';
import path from 'node:path';
import {
  inspectWindowsSyncGroupDatabase
} from './windows-sync-group-recovery-action.mjs';

export async function runWindowsSyncGroupTask3Protect({ buildIdentity, evidenceRoot, execute, paths }) {
  const current = await inspectWindowsSyncGroupDatabase(execute, paths);
  if (current.activeMemberCount !== 3 || current.localMemberState !== 'active'
      || current.missingAttachmentCount !== 0 || current.missingContentBlobCount !== 0) {
    throw new Error(`Windows C is not a complete task 2 output: ${JSON.stringify(current)}`);
  }
  const manifestPath = path.join(evidenceRoot, 'sync-group-task3-protection.json');
  fs.writeFileSync(manifestPath, `${JSON.stringify({ buildIdentity,
    completedAt: new Date().toISOString(), current, resultStatus: 'success', schemaVersion: 2
  }, null, 2)}\n`, 'utf8');
  return { output: '', syncGroupTask3Protection: { manifestPath } };
}
