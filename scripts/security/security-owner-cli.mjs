/* global console */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { importSecurityObservation, projectSecurityOwner, setSecurityDisposition } from './security-owner.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const owner = path.join(root, '.lab/internal/security-maintenance');
const json = file => JSON.parse(readFileSync(file, 'utf8'));
try {
  const [command, ...args] = process.argv.slice(2);
  if (command === 'import' && args.length === 3) {
    const receipt = importSecurityObservation(owner, { rawReport: readFileSync(args[0], 'utf8'),
      envelope: json(args[1]), rawLock: readFileSync(args[2], 'utf8') });
    console.log(JSON.stringify({ id: receipt.observation.id, duplicate: receipt.duplicate, file: receipt.file }));
  } else if (command === 'status' && !args.length) {
    const state = projectSecurityOwner(owner);
    console.log(JSON.stringify({ status: state.overallStatus, observations: state.observations,
      activeFindings: state.findings.filter(finding => finding.active), gaps: state.gaps, importHealth: state.health,
      sourceErrors: state.sources.filter(source => ['error', 'unsupported'].includes(source.status) || source.stale) }));
  } else if (command === 'disposition' && args.length === 1) {
    console.log(JSON.stringify(setSecurityDisposition(owner, json(args[0]))));
  } else throw new Error('Usage: security-owner-cli.mjs import REPORT ENVELOPE LOCK | status | disposition JSON');
} catch (error) { console.error(error.message); process.exitCode = 1; }
