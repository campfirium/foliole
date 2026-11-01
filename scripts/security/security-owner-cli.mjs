/* global console */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { importSecurityObservation, projectSecurityOwner, setSecurityDisposition } from './security-owner.mjs';
import { notifySecurityOwner, securityNotificationStatus } from './security-notifications.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const owner = path.join(root, '.lab/internal/security-maintenance');
const json = file => JSON.parse(readFileSync(file, 'utf8'));
try {
  const [command, ...args] = process.argv.slice(2);
  if (command === 'import' && args.length === 3) {
    const receipt = importSecurityObservation(owner, { rawReport: readFileSync(args[0], 'utf8'),
      envelope: json(args[1]), rawLock: readFileSync(args[2], 'utf8') });
    notifySecurityOwner(owner, root);
    console.log(JSON.stringify({ id: receipt.observation.id, duplicate: receipt.duplicate, file: receipt.file }));
  } else if (command === 'status' && !args.length) {
    const state = projectSecurityOwner(owner);
    console.log(JSON.stringify({ status: state.overallStatus, observations: state.observations,
      activeFindings: state.findings.filter(finding => finding.active), gaps: state.gaps, importHealth: state.health,
      sourceErrors: state.sources.filter(source => ['error', 'unsupported'].includes(source.status) || source.stale),
      notifications: securityNotificationStatus(owner) }));
  } else if (command === 'disposition' && args.length === 1) {
    console.log(JSON.stringify(setSecurityDisposition(owner, json(args[0]))));
    notifySecurityOwner(owner, root);
  } else if (command === 'notify' && !args.length) {
    console.log(JSON.stringify(notifySecurityOwner(owner, root)));
  } else throw new Error('Usage: security-owner-cli.mjs import REPORT ENVELOPE LOCK | status | notify | disposition JSON');
} catch (error) {
  console.error(error.message);
  try { notifySecurityOwner(owner, root); }
  catch (notificationError) { console.error(`Notification pending: ${notificationError.message}`); }
  process.exitCode = 1;
}
