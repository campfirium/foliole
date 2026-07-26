import fs from 'node:fs';
import path from 'node:path';

export const LAB_EVIDENCE_FILES = new Set([
  'action-receipt.json', 'after.png', 'before.png', 'command-audit.json', 'logcat.txt',
  'native-ui-summary.json', 'on-failure.png', 'review-audit.json', 'runner.log',
  'screenshot.png', 'semantic-snapshot.json', 'stderr.txt', 'stdout.txt', 'summary.json',
  'ui-command-audit.json'
]);

export function isAndroidLabRunId(value) {
  return /^[1-9]\d{0,15}-[0-9a-f]{12}(?:-(?:prepare|capture|restart|scenario))?$/u.test(String(value || ''));
}

export function safeLabEvidencePath(evidenceRoot, relativePath) {
  if (!evidenceRoot || !LAB_EVIDENCE_FILES.has(relativePath)) throw new Error('evidence file is not allowed');
  return path.join(evidenceRoot, relativePath);
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
    return { files: [...LAB_EVIDENCE_FILES].filter((name) => fs.existsSync(path.join(evidenceRoot, name))).sort(), schemaVersion: 1 };
  }
  const filePath = safeLabEvidencePath(evidenceRoot, command.relativePath);
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) throw new Error('evidence path is not a file');
  stdout.write(fs.readFileSync(filePath));
  return null;
}
