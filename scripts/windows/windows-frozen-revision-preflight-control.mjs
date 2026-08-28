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
  await copyFile(remote.receiptPath, path.join(localRoot, 'receipt.json'));
  const receipt = JSON.parse(fsApi.readFileSync(path.join(localRoot, 'receipt.json'), 'utf8'));
  if (receipt.aggregateAttemptId !== remote.attemptId || receipt.source?.revision !== source.revision
      || receipt.source?.tree !== source.tree || !Array.isArray(receipt.attempts)
      || receipt.attempts.length === 0) {
    throw new Error('Windows aggregate preflight receipt does not match the accepted source.');
  }
  for (const attempt of receipt.attempts) {
    const attemptRoot = path.join(localRoot, 'attempts', attempt.attemptId);
    fsApi.mkdirSync(attemptRoot, { recursive: true });
    await copyFile(attempt.receiptPath, path.join(attemptRoot, 'receipt.json'));
    await copyFile(`${attempt.evidenceRoot.replaceAll('\\', '/')}/action.log`,
      path.join(attemptRoot, 'action.log'));
    const attemptReceipt = JSON.parse(fsApi.readFileSync(path.join(attemptRoot, 'receipt.json'), 'utf8'));
    if (!remoteError) assertCompleteFrozenPreflightReceipt(attemptReceipt, source);
    else if (attemptReceipt.resultStatus !== 'failed') {
      throw new Error('Windows failed attempt did not preserve a failed receipt.');
    }
  }
  await copyFile(`${actionRoot}/summary.json`, path.join(localRoot, 'summary.json'));
  if (!remoteError && (receipt.resultStatus !== 'complete' || receipt.attempts.length !== 2
      || receipt.isolation?.distinctTaskCopies !== true
      || new Set(receipt.attempts.map(({ taskCopyRoot }) => taskCopyRoot)).size !== 2)) {
    throw new Error('Windows aggregate preflight isolation evidence is incomplete.');
  }
  if (remoteError && receipt.resultStatus !== 'failed') {
    throw new Error('Windows failed preflight did not preserve a failed receipt.');
  }
  return { attemptReceipt: receipt, evidenceRoot: localRoot,
    manifestPath: path.join(localRoot, 'receipt.json') };
}
