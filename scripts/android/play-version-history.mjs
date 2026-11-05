/* global console, process */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import { PLAY_PACKAGE } from './play-api.mjs';

const historyFile = fileURLToPath(new URL('./play-version-history.json', import.meta.url));

export function readPlayVersionHistory(file = historyFile) {
  const history = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (history?.schemaVersion !== 1 || history.packageName !== PLAY_PACKAGE ||
      !Number.isSafeInteger(history.highestVersionCode) || history.highestVersionCode < 1 ||
      history.highestVersionCode > 2100000000 || !history.evidence?.source ||
      !Number.isFinite(Date.parse(history.evidence.observedAt))) {
    throw new Error('Verified Play version history is missing or invalid');
  }
  return history;
}

export function recordPlayVersion(receipt, file = historyFile) {
  const history = readPlayVersionHistory(file);
  const phases = ['upload-unknown', 'uploaded', 'commit-unknown', 'committed', 'observed'];
  if (receipt?.packageName !== PLAY_PACKAGE || receipt.track !== 'beta' || !phases.includes(receipt.phase) ||
      receipt.schemaVersion !== 1 || !Number.isSafeInteger(receipt.versionCode) || receipt.versionCode < 1 ||
      receipt.versionCode > 2100000000 || !/^[a-f0-9]{40}$/u.test(receipt.sourceSha ?? '') ||
      receipt.acceptedSha !== receipt.sourceSha || !/^[1-9]\d*$/u.test(receipt.runId ?? '') ||
      !/^[a-f0-9]{64}$/u.test(receipt.aabSha256 ?? '')) {
    throw new Error('A matching attempted or confirmed Play upload receipt is required');
  }
  if (receipt.versionCode <= history.highestVersionCode) return history;
  const next = { ...history, highestVersionCode: receipt.versionCode, evidence: {
    source: `https://github.com/campfirium/foliole/actions/runs/${receipt.runId}`,
    observedAt: new Date().toISOString(), sourceSha: receipt.sourceSha,
    aabSha256: receipt.aabSha256, phase: receipt.phase
  } };
  const temporary = `${file}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(temporary, `${JSON.stringify(next, null, 2)}\n`, { flag: 'wx' });
    fs.renameSync(temporary, file);
  } finally { fs.rmSync(temporary, { force: true }); }
  return next;
}

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  try {
    if (process.argv[2] !== 'record' || !process.argv[3]) throw new Error('Usage: play-version-history.mjs record <candidate.json>');
    const receipt = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
    console.log(`Remembered Play versionCode ${recordPlayVersion(receipt).highestVersionCode}`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
