import fs from 'node:fs';
import path from 'node:path';

import { assertCompleteFrozenPreflightReceipt } from
  '../acceptance/frozen-revision-preflight-contract.mjs';
import { WINDOWS_DEV_EVIDENCE_PREFIX } from './windows-dev-paths.mjs';

const LINE_PATTERN = /\[windows-dev-action\] frozen-revision-preflight identity=([^\s]+) receipt=([^\r\n]+)/u;

export function parseWindowsFrozenPreflightEvidence(output) {
  const match = LINE_PATTERN.exec(output);
  if (!match) throw new Error('Windows frozen revision preflight receipt was not reported.');
  const receiptPath = match[2].replaceAll('\\', '/');
  if (!receiptPath.startsWith(WINDOWS_DEV_EVIDENCE_PREFIX)
      || !receiptPath.endsWith('/frozen-revision-preflight/receipt.json')) {
    throw new Error('Windows frozen revision preflight receipt escaped its fixed evidence root.');
  }
  return { attemptId: match[1], receiptPath };
}

export async function copyWindowsFrozenPreflightEvidence({
  copyFile, fsApi = fs, localCandidate, output, repoRoot, remoteError
}) {
  const remote = parseWindowsFrozenPreflightEvidence(output);
  const source = { revision: localCandidate.revision, tree: localCandidate.treeDigest };
  const localRoot = path.join(repoRoot, '.tmp', 'artifacts', 'frozen-revision-preflight',
    source.revision, 'windows', remote.attemptId);
  fsApi.mkdirSync(localRoot, { recursive: true });
  const remoteRoot = path.posix.dirname(remote.receiptPath);
  const actionRoot = path.posix.dirname(remoteRoot);
  for (const [remotePath, name] of [
    [remote.receiptPath, 'receipt.json'],
    [`${remoteRoot}/action.log`, 'action.log'],
    [`${actionRoot}/summary.json`, 'summary.json']
  ]) await copyFile(remotePath, path.join(localRoot, name));
  const receipt = JSON.parse(fsApi.readFileSync(path.join(localRoot, 'receipt.json'), 'utf8'));
  if (!remoteError) assertCompleteFrozenPreflightReceipt(receipt, source);
  else if (receipt.resultStatus !== 'failed') {
    throw new Error('Windows failed preflight did not preserve a failed receipt.');
  }
  return { attemptReceipt: receipt, evidenceRoot: localRoot,
    manifestPath: path.join(localRoot, 'receipt.json') };
}
