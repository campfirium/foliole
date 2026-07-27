import fs from 'node:fs';
import path from 'node:path';

export const LAB_EVIDENCE_FILES = new Set([
  'action-receipt.json', 'after.png', 'before.png', 'command-audit.json', 'logcat.txt',
  'native-ui-summary.json', 'on-failure.png', 'review-audit.json', 'runner.log',
  'screenshot.png', 'semantic-snapshot.json', 'stderr.txt', 'stdout.txt', 'summary.json',
  'ui-command-audit.json'
]);
const LAB_EVIDENCE_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/u;

export function isAndroidLabRunId(value) {
  return /^[1-9]\d{0,15}-[0-9a-f]{12}(?:-(?:prepare|capture|restart|scenario))?$/u.test(String(value || ''));
}

export function safeLabEvidencePath(evidenceRoot, relativePath) {
  const parts = String(relativePath || '').split('/');
  const fileName = parts.at(-1);
  if (!evidenceRoot || parts.length < 1 || parts.length > 2 || !LAB_EVIDENCE_FILES.has(fileName)) {
    throw new Error('evidence file is not allowed');
  }
  if (!parts.every((part) => LAB_EVIDENCE_SEGMENT.test(part))) throw new Error('evidence file is not allowed');
  return path.join(evidenceRoot, ...parts);
}

function requestedEvidenceRoot(command, paths, status) {
  if (!command.runId) {
    if (!status?.evidenceRoot) throw new Error('evidence is unavailable');
    return status.evidenceRoot;
  }
  const evidenceRoot = path.join(paths.evidence, command.runId);
  if (!fs.existsSync(evidenceRoot) || !fs.statSync(evidenceRoot).isDirectory()) {
    throw Object.assign(new Error('evidence run is unavailable'), { code: 'android_lab_evidence_run_missing' });
  }
  return evidenceRoot;
}

export function collectLabEvidence(command, paths, status, stdout) {
  const evidenceRoot = requestedEvidenceRoot(command, paths, status);
  if (command.operation === 'list') {
    return { files: listEvidenceFiles(evidenceRoot), schemaVersion: 1 };
  }
  const filePath = safeLabEvidencePath(evidenceRoot, command.relativePath);
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) throw new Error('evidence path is not a file');
  stdout.write(fs.readFileSync(filePath));
  return null;
}

function listEvidenceFiles(evidenceRoot) {
  const found = [];
  for (const entry of fs.readdirSync(evidenceRoot, { withFileTypes: true })) {
    if (entry.isFile() && LAB_EVIDENCE_FILES.has(entry.name)) found.push(entry.name);
    if (!entry.isDirectory() || !LAB_EVIDENCE_SEGMENT.test(entry.name)) continue;
    for (const nested of fs.readdirSync(path.join(evidenceRoot, entry.name), { withFileTypes: true })) {
      if (nested.isFile() && LAB_EVIDENCE_FILES.has(nested.name)) found.push(`${entry.name}/${nested.name}`);
    }
  }
  return found.sort();
}
