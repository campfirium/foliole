import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import {
  DEFAULT_CANDIDATE_SOURCE_REF, normalizeCandidateSourceRef
} from '../sync-group/multi-device-sync-source-ref.mjs';
import { currentAcceptanceCandidate } from '../sync-group/multi-device-sync-candidate.mjs';
import { WINDOWS_DEV_EVIDENCE_PREFIX } from './windows-dev-paths.mjs';

export const WINDOWS_DEV_TARGET_REF = 'refs/heads/dev';
const REVISION = /^[0-9a-f]{40}$/u;

export function extractCandidateRevision(args) {
  const remaining = [...args];
  const index = remaining.indexOf('--revision');
  if (index < 0) return { args: remaining, revision: null };
  const revision = remaining[index + 1];
  if (!REVISION.test(revision ?? '')) throw new Error('Windows candidate revision must be a full SHA');
  remaining.splice(index, 2);
  return { args: remaining, revision };
}

export function assertPinnedDevRevision(repoRoot, revision, run = spawnSync) {
  if (!REVISION.test(revision ?? '')) throw new Error('Windows candidate revision must be a full SHA');
  const branch = run('git', ['branch', '--show-current'], { cwd: repoRoot, encoding: 'utf8' });
  if (branch.status !== 0 || branch.stdout.trim() !== 'dev') {
    throw new Error('Pinned Windows candidate requires Mac dev');
  }
  const ancestor = run('git', ['merge-base', '--is-ancestor', revision, 'refs/heads/dev'], {
    cwd: repoRoot
  });
  if (ancestor.status !== 0) throw new Error('Pinned Windows candidate must belong to Mac dev');
  return revision;
}

export function extractCandidateSourceRef(args) {
  const remaining = [...args];
  const index = remaining.indexOf('--source-ref');
  if (index < 0) return { args: remaining, explicit: false, sourceRef: DEFAULT_CANDIDATE_SOURCE_REF };
  if (index + 1 >= remaining.length) throw new Error('Windows DEV source ref is missing');
  const sourceRef = normalizeCandidateSourceRef(remaining[index + 1]);
  remaining.splice(index, 2);
  return { args: remaining, explicit: true, sourceRef };
}

export function windowsCandidatePushArgs(host, sourceRef = DEFAULT_CANDIDATE_SOURCE_REF, revision = null) {
  const normalized = normalizeCandidateSourceRef(sourceRef);
  if (revision && !REVISION.test(revision)) throw new Error('Windows candidate revision must be a full SHA');
  const source = revision ?? (normalized === DEFAULT_CANDIDATE_SOURCE_REF ? 'dev' : normalized);
  return ['push', '--no-verify', '--porcelain', `${host}:foliole-dev.git`,
    `+${source}:${WINDOWS_DEV_TARGET_REF}`];
}

export function freezeWindowsCandidate(repoRoot, sourceRef) {
  return currentAcceptanceCandidate(repoRoot, 'diagnostic', sourceRef);
}

function remoteCandidateEvidence(output) {
  const match = /\[windows-dev-action\] multi-device-sync-candidate identity=([^\s]+) manifest=([^\r\n]+)/u
    .exec(output);
  if (!match) throw new Error('Windows candidate manifest was not reported');
  const expected = `${WINDOWS_DEV_EVIDENCE_PREFIX}${match[1]}/`;
  const manifestPath = match[2].replaceAll('\\', '/');
  if (!manifestPath.startsWith(expected) || !manifestPath.endsWith('/multi-device-sync-candidate.json')) {
    throw new Error('Windows candidate manifest escaped its fixed evidence root');
  }
  return { identity: match[1], manifestPath };
}

function matchingBoundary(local, remote) {
  return remote?.branch === 'dev' && remote.clean === true && remote.committed === true
    && remote.revision === local.revision && remote.treeDigest === local.treeDigest;
}

export async function copyWindowsCandidateReceipt({ copyFile, fsApi = fs, localCandidate,
  output, repoRoot, sourceRef }) {
  const evidence = remoteCandidateEvidence(output);
  const root = path.join(repoRoot, '.tmp', 'artifacts', 'windows-candidate', evidence.identity);
  fsApi.mkdirSync(root, { recursive: true });
  const remotePath = path.join(root, 'multi-device-sync-candidate.json');
  await copyFile(evidence.manifestPath, remotePath);
  const remote = JSON.parse(fsApi.readFileSync(remotePath, 'utf8'));
  if (remote.resultStatus !== 'success' || !matchingBoundary(localCandidate, remote.candidate)) {
    throw new Error('Windows candidate boundary does not match the local frozen candidate');
  }
  const receipt = { remoteBranch: remote.candidate.branch,
    resultStatus: 'success', revision: localCandidate.revision, schemaVersion: 1,
    sourceRef: normalizeCandidateSourceRef(sourceRef), targetRef: WINDOWS_DEV_TARGET_REF,
    treeDigest: localCandidate.treeDigest };
  const receiptPath = path.join(root, 'candidate-controller-receipt.json');
  fsApi.writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  return { receipt, receiptPath, root };
}

export async function collectWindowsCandidateControl({ copyFile, fsApi, localCandidate,
  output, repoRoot, sourceRef, stdout }) {
  const copied = await copyWindowsCandidateReceipt({ copyFile, fsApi, localCandidate,
    output, repoRoot, sourceRef });
  stdout.write(`[windows-dev-control] candidate-receipt=${JSON.stringify(copied.receipt)}\n`);
  return { candidateReceipt: copied.receipt, evidenceRoot: copied.root,
    manifestPath: copied.receiptPath };
}
